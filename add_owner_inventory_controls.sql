-- Run once before enabling the owner dashboard.
-- Adds the maximum stock target used for reorder recommendations and records
-- every owner-entered stock/settings change in an audit table.

alter table public.ingredients
add column if not exists max_stock_oz numeric;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.ingredients'::regclass
          and conname = 'ingredients_max_stock_oz_nonnegative'
    ) then
        alter table public.ingredients
        add constraint ingredients_max_stock_oz_nonnegative
        check (max_stock_oz is null or max_stock_oz >= 0);
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.ingredients'::regclass
          and conname = 'ingredients_threshold_not_above_max'
    ) then
        alter table public.ingredients
        add constraint ingredients_threshold_not_above_max
        check (
            low_stock_threshold_oz is null
            or max_stock_oz is null
            or low_stock_threshold_oz <= max_stock_oz
        );
    end if;
end;
$$;

create table if not exists public.inventory_adjustments (
    id uuid primary key default gen_random_uuid(),
    ingredient_id integer not null
        references public.ingredients(id) on delete restrict,
    stock_before_oz numeric not null,
    stock_after_oz numeric not null,
    threshold_before_oz numeric,
    threshold_after_oz numeric not null,
    max_before_oz numeric,
    max_after_oz numeric not null,
    reason text not null,
    adjusted_by text,
    adjusted_at timestamp with time zone not null default now()
);

alter table public.inventory_adjustments enable row level security;

create index if not exists inventory_adjustments_ingredient_time_idx
on public.inventory_adjustments (ingredient_id, adjusted_at desc);

create or replace function public.update_ingredient_inventory_settings(
    p_ingredient_id integer,
    p_current_stock_oz numeric,
    p_low_stock_threshold_oz numeric,
    p_max_stock_oz numeric,
    p_reason text,
    p_adjusted_by text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_before public.ingredients%rowtype;
begin
    if p_current_stock_oz is null or p_current_stock_oz < 0 then
        raise exception 'Current stock must be zero or greater';
    end if;

    if p_low_stock_threshold_oz is null
       or p_low_stock_threshold_oz < 0 then
        raise exception 'Restock threshold must be zero or greater';
    end if;

    if p_max_stock_oz is null or p_max_stock_oz <= 0 then
        raise exception 'Maximum stock must be greater than zero';
    end if;

    if p_low_stock_threshold_oz > p_max_stock_oz then
        raise exception 'Restock threshold cannot exceed maximum stock';
    end if;

    if p_reason is null or btrim(p_reason) = '' then
        raise exception 'An adjustment reason is required';
    end if;

    select *
    into v_before
    from public.ingredients
    where id = p_ingredient_id
    for update;

    if not found then
        raise exception 'Ingredient % was not found', p_ingredient_id;
    end if;

    update public.ingredients
    set
        current_stock_oz = p_current_stock_oz,
        low_stock_threshold_oz = p_low_stock_threshold_oz,
        max_stock_oz = p_max_stock_oz
    where id = p_ingredient_id;

    insert into public.inventory_adjustments (
        ingredient_id,
        stock_before_oz,
        stock_after_oz,
        threshold_before_oz,
        threshold_after_oz,
        max_before_oz,
        max_after_oz,
        reason,
        adjusted_by
    )
    values (
        p_ingredient_id,
        v_before.current_stock_oz,
        p_current_stock_oz,
        v_before.low_stock_threshold_oz,
        p_low_stock_threshold_oz,
        v_before.max_stock_oz,
        p_max_stock_oz,
        btrim(p_reason),
        nullif(btrim(p_adjusted_by), '')
    );

    return jsonb_build_object(
        'ingredient_id', p_ingredient_id,
        'ingredient_name', v_before.name,
        'current_stock_oz', p_current_stock_oz,
        'low_stock_threshold_oz', p_low_stock_threshold_oz,
        'max_stock_oz', p_max_stock_oz
    );
end;
$$;

revoke all on table public.inventory_adjustments
from public, anon, authenticated;

revoke all on function public.update_ingredient_inventory_settings(
    integer,
    numeric,
    numeric,
    numeric,
    text,
    text
) from public, anon, authenticated;

grant all on table public.inventory_adjustments to service_role;

grant execute on function public.update_ingredient_inventory_settings(
    integer,
    numeric,
    numeric,
    numeric,
    text,
    text
) to service_role;
