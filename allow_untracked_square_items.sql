-- Run once after add_processed_orders.sql.
-- Ghost Coffee intentionally tracks only the Square menu items configured in
-- public.menu_items. Other catalog items are ignored, while tracked items must
-- still have a complete recipe before the order can be processed.

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
    v_is_tracked boolean;
    v_mapping_count integer;
    v_recipe_id uuid;
    v_tracked_line_count integer := 0;
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
        0
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

        select exists (
            select 1
            from public.menu_items as menu_item
            where menu_item.square_item_id = v_square_item_id
        )
        into v_is_tracked;

        if not v_is_tracked then
            continue;
        end if;

        select
            count(*),
            min(menu_item.recipe_id::text)::uuid
        into
            v_mapping_count,
            v_recipe_id
        from public.menu_items as menu_item
        where menu_item.square_item_id = v_square_item_id;

        if v_mapping_count <> 1 or v_recipe_id is null then
            raise exception
                'Tracked Square item % must map to exactly one recipe',
                v_square_item_id;
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

        if exists (
            select 1
            from public.recipe_ingredients as recipe_ingredient
            where recipe_ingredient.recipe_id = v_recipe_id
              and (
                recipe_ingredient.quantity_required_oz is null
                or recipe_ingredient.quantity_required_oz <= 0
              )
        ) then
            raise exception
                'Tracked Square item % has an invalid recipe quantity',
                v_square_item_id;
        end if;

        v_tracked_line_count := v_tracked_line_count + 1;

        with deductions as (
            select
                recipe_ingredient.ingredient_id,
                sum(recipe_ingredient.quantity_required_oz) as quantity_oz
            from public.recipe_ingredients as recipe_ingredient
            where recipe_ingredient.recipe_id = v_recipe_id
            group by recipe_ingredient.ingredient_id
        ),
        updated as (
            update public.ingredients as ingredient
            set current_stock_oz =
                ingredient.current_stock_oz
                - (deduction.quantity_oz * v_quantity)
            from deductions as deduction
            where ingredient.id = deduction.ingredient_id
            returning ingredient.id
        )
        select count(*)
        into v_deducted_ingredients
        from updated;

        if v_deducted_ingredients = 0 then
            raise exception
                'Tracked Square item % has no mapped recipe ingredients',
                v_square_item_id;
        end if;
    end loop;

    update public.processed_orders
    set line_item_count = v_tracked_line_count
    where square_order_id = p_square_order_id;

    return true;
end;
$$;

revoke all on function public.process_square_order(
    text,
    text,
    timestamp with time zone,
    jsonb
) from public, anon, authenticated;

grant execute on function public.process_square_order(
    text,
    text,
    timestamp with time zone,
    jsonb
) to service_role;
