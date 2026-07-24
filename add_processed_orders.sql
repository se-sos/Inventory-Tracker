-- Run this once in the Supabase SQL Editor before starting process_orders.ts.
-- It makes processing a Square order and deducting its ingredients one
-- database transaction. A repeated order ID returns false without deducting.

create table if not exists public.processed_orders (
    square_order_id text primary key,
    square_location_id text,
    square_closed_at timestamp with time zone,
    line_item_count integer not null default 0 check (line_item_count >= 0),
    processed_at timestamp with time zone not null default now()
);

alter table public.processed_orders enable row level security;

create table if not exists public.integration_checkpoints (
    name text primary key,
    checkpoint_at timestamp with time zone not null,
    updated_at timestamp with time zone not null default now()
);

alter table public.integration_checkpoints enable row level security;

create or replace function public.get_integration_checkpoint(p_name text)
returns timestamp with time zone
language sql
stable
security invoker
set search_path = public
as $$
    select checkpoint.checkpoint_at
    from public.integration_checkpoints as checkpoint
    where checkpoint.name = p_name;
$$;

create or replace function public.advance_integration_checkpoint(
    p_name text,
    p_checkpoint_at timestamp with time zone
)
returns timestamp with time zone
language sql
security invoker
set search_path = public
as $$
    insert into public.integration_checkpoints (
        name,
        checkpoint_at,
        updated_at
    )
    values (
        p_name,
        p_checkpoint_at,
        now()
    )
    on conflict (name) do update
    set
        checkpoint_at = greatest(
            public.integration_checkpoints.checkpoint_at,
            excluded.checkpoint_at
        ),
        updated_at = now()
    returning checkpoint_at;
$$;

create or replace function public.process_square_order(
    p_square_order_id text,
    p_location_id text,
    p_closed_at timestamp with time zone,
    p_line_items jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_claimed integer;
    v_line jsonb;
    v_square_item_id text;
    v_quantity numeric;
    v_deducted_ingredients integer;
begin
    if p_square_order_id is null or btrim(p_square_order_id) = '' then
        raise exception 'Square order ID is required';
    end if;

    if p_line_items is null or jsonb_typeof(p_line_items) <> 'array' then
        raise exception 'Line items must be a JSON array';
    end if;

    insert into public.processed_orders (
        square_order_id,
        square_location_id,
        square_closed_at,
        line_item_count
    )
    values (
        p_square_order_id,
        p_location_id,
        p_closed_at,
        jsonb_array_length(p_line_items)
    )
    on conflict (square_order_id) do nothing;

    get diagnostics v_claimed = row_count;

    if v_claimed = 0 then
        return false;
    end if;

    for v_line in
        select value from jsonb_array_elements(p_line_items)
    loop
        v_square_item_id := v_line ->> 'square_item_id';

        if v_square_item_id is null or btrim(v_square_item_id) = '' then
            raise exception 'Every line item must have a Square item ID';
        end if;

        begin
            v_quantity := (v_line ->> 'quantity')::numeric;
        exception
            when invalid_text_representation then
                raise exception 'Invalid quantity for Square item %', v_square_item_id;
        end;

        if v_quantity is null or v_quantity <= 0 then
            raise exception 'Quantity must be positive for Square item %', v_square_item_id;
        end if;

        update public.ingredients as ingredient
        set current_stock_oz =
            ingredient.current_stock_oz
            - (recipe_ingredient.quantity_required_oz * v_quantity)
        from public.recipe_ingredients as recipe_ingredient
        join public.menu_items as menu_item
          on menu_item.recipe_id = recipe_ingredient.recipe_id
        where menu_item.square_item_id = v_square_item_id
          and ingredient.id = recipe_ingredient.ingredient_id;

        get diagnostics v_deducted_ingredients = row_count;

        if v_deducted_ingredients = 0 then
            raise exception
                'Square item % has no mapped recipe ingredients',
                v_square_item_id;
        end if;
    end loop;

    return true;
end;
$$;

revoke all on table public.processed_orders from public, anon, authenticated;
revoke all on table public.integration_checkpoints
from public, anon, authenticated;

revoke all on function public.process_square_order(text, text, timestamp with time zone, jsonb)
from public, anon, authenticated;

grant all on table public.processed_orders to service_role;
grant all on table public.integration_checkpoints to service_role;

revoke all on function public.get_integration_checkpoint(text)
from public, anon, authenticated;

revoke all on function public.advance_integration_checkpoint(
    text,
    timestamp with time zone
) from public, anon, authenticated;

grant execute on function public.get_integration_checkpoint(text)
to service_role;

grant execute on function public.advance_integration_checkpoint(
    text,
    timestamp with time zone
) to service_role;

grant execute on function public.process_square_order(
    text,
    text,
    timestamp with time zone,
    jsonb
) to service_role;
