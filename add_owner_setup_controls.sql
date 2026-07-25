-- Run once in the Supabase SQL Editor before deploying the Owner Setup page.
-- This migration:
--   * preserves all existing ingredients, menu items, and recipe quantities
--   * adds archive flags instead of destructive deletes
--   * adds a read-only Square catalog cache
--   * validates and saves owner changes transactionally
--   * records every setup change in an audit trail

begin;

alter table public.ingredients
add column if not exists is_active boolean not null default true;

alter table public.menu_items
add column if not exists is_active boolean not null default true;

do $$
begin
    if exists (
        select 1
        from public.ingredients
        where is_active
        group by lower(btrim(name))
        having count(*) > 1
    ) then
        raise exception
            'Active ingredient names must be unique before Owner Setup can be enabled';
    end if;

    if exists (
        select 1
        from public.menu_items
        where is_active
        group by square_item_id
        having count(*) > 1
    ) then
        raise exception
            'Active Square mappings must be unique before Owner Setup can be enabled';
    end if;

    if exists (
        select 1
        from public.menu_items
        where is_active
        group by lower(btrim(item_name))
        having count(*) > 1
    ) then
        raise exception
            'Active menu item names must be unique before Owner Setup can be enabled';
    end if;

    if exists (
        select 1
        from public.ingredients
        where is_active
          and nullif(btrim(gfs_code), '') is not null
        group by gfs_code
        having count(*) > 1
    ) then
        raise exception
            'Active GFS receiving codes must be unique before Owner Setup can be enabled';
    end if;
end;
$$;

drop index if exists public.menu_items_square_item_id_tracking_unique;

create unique index if not exists ingredients_active_name_unique
on public.ingredients (lower(btrim(name)))
where is_active;

create unique index if not exists ingredients_active_gfs_code_unique
on public.ingredients (gfs_code)
where is_active and nullif(btrim(gfs_code), '') is not null;

create unique index if not exists menu_items_active_square_item_unique
on public.menu_items (square_item_id)
where is_active;

create unique index if not exists menu_items_active_name_unique
on public.menu_items (lower(btrim(item_name)))
where is_active;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.ingredients'::regclass
          and conname = 'ingredients_owner_setup_values_valid'
    ) then
        alter table public.ingredients
        add constraint ingredients_owner_setup_values_valid
        check (
            btrim(name) <> ''
            and current_stock_oz >= 0
            and (
                pack_size_oz is null
                or pack_size_oz > 0
            )
        );
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.menu_items'::regclass
          and conname = 'menu_items_owner_setup_name_valid'
    ) then
        alter table public.menu_items
        add constraint menu_items_owner_setup_name_valid
        check (btrim(item_name) <> '');
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.recipe_ingredients'::regclass
          and conname = 'recipe_ingredients_owner_setup_quantity_positive'
    ) then
        alter table public.recipe_ingredients
        add constraint recipe_ingredients_owner_setup_quantity_positive
        check (quantity_required_oz > 0);
    end if;
end;
$$;

create table if not exists public.square_catalog_variations (
    square_variation_id text primary key,
    item_name text not null,
    variation_name text,
    display_name text not null,
    sku text,
    is_available boolean not null default true,
    refreshed_at timestamp with time zone not null default now()
);

alter table public.square_catalog_variations enable row level security;

create index if not exists square_catalog_variations_available_name_idx
on public.square_catalog_variations (is_available, display_name);

create table if not exists public.inventory_setup_activity (
    id uuid primary key default gen_random_uuid(),
    action text not null,
    entity_type text not null,
    entity_id text,
    entity_name text,
    details jsonb not null default '{}'::jsonb,
    changed_by text,
    changed_at timestamp with time zone not null default now()
);

alter table public.inventory_setup_activity enable row level security;

create index if not exists inventory_setup_activity_time_idx
on public.inventory_setup_activity (changed_at desc);

create or replace function public.replace_square_catalog_cache(
    p_variations jsonb,
    p_changed_by text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_entry jsonb;
    v_count integer := 0;
    v_id text;
    v_item_name text;
    v_variation_name text;
    v_display_name text;
    v_sku text;
begin
    if p_variations is null or jsonb_typeof(p_variations) <> 'array' then
        raise exception 'Square catalog data must be a JSON array';
    end if;

    if jsonb_array_length(p_variations) = 0 then
        raise exception 'Square returned no catalog variations';
    end if;

    update public.square_catalog_variations
    set is_available = false;

    for v_entry in
        select value from jsonb_array_elements(p_variations)
    loop
        v_id := btrim(coalesce(v_entry ->> 'square_variation_id', ''));
        v_item_name := btrim(coalesce(v_entry ->> 'item_name', ''));
        v_variation_name := nullif(
            btrim(coalesce(v_entry ->> 'variation_name', '')),
            ''
        );
        v_display_name := btrim(coalesce(v_entry ->> 'display_name', ''));
        v_sku := nullif(btrim(coalesce(v_entry ->> 'sku', '')), '');

        if v_id = '' or v_item_name = '' or v_display_name = '' then
            raise exception 'Square catalog entries require an ID and name';
        end if;

        insert into public.square_catalog_variations (
            square_variation_id,
            item_name,
            variation_name,
            display_name,
            sku,
            is_available,
            refreshed_at
        )
        values (
            v_id,
            v_item_name,
            v_variation_name,
            v_display_name,
            v_sku,
            true,
            now()
        )
        on conflict (square_variation_id) do update
        set
            item_name = excluded.item_name,
            variation_name = excluded.variation_name,
            display_name = excluded.display_name,
            sku = excluded.sku,
            is_available = true,
            refreshed_at = now();

        v_count := v_count + 1;
    end loop;

    insert into public.inventory_setup_activity (
        action,
        entity_type,
        entity_name,
        details,
        changed_by
    )
    values (
        'catalog_refreshed',
        'square_catalog',
        'Square food catalog',
        jsonb_build_object('variation_count', v_count),
        nullif(btrim(p_changed_by), '')
    );

    return v_count;
end;
$$;

create or replace function public.save_owner_ingredient(
    p_ingredient_id integer,
    p_name text,
    p_current_stock_oz numeric,
    p_low_stock_threshold_oz numeric,
    p_max_stock_oz numeric,
    p_gfs_code text,
    p_pack_size_oz numeric,
    p_reason text,
    p_changed_by text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_id integer;
    v_name text := btrim(coalesce(p_name, ''));
    v_gfs_code text := nullif(btrim(coalesce(p_gfs_code, '')), '');
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
    v_action text;
    v_before public.ingredients%rowtype;
begin
    if v_name = '' then
        raise exception 'Ingredient name is required';
    end if;

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

    if p_pack_size_oz is not null and p_pack_size_oz <= 0 then
        raise exception 'Pack size must be greater than zero when provided';
    end if;

    if exists (
        select 1
        from public.ingredients as ingredient
        where ingredient.is_active
          and lower(btrim(ingredient.name)) = lower(v_name)
          and (
              p_ingredient_id is null
              or ingredient.id <> p_ingredient_id
          )
    ) then
        raise exception 'An active ingredient named % already exists', v_name;
    end if;

    if v_gfs_code is not null and exists (
        select 1
        from public.ingredients as ingredient
        where ingredient.is_active
          and ingredient.gfs_code = v_gfs_code
          and (
              p_ingredient_id is null
              or ingredient.id <> p_ingredient_id
          )
    ) then
        raise exception 'GFS code % is already assigned', v_gfs_code;
    end if;

    if p_ingredient_id is null then
        insert into public.ingredients (
            name,
            current_stock_oz,
            low_stock_threshold_oz,
            max_stock_oz,
            gfs_code,
            pack_size_oz,
            is_active
        )
        values (
            v_name,
            p_current_stock_oz,
            p_low_stock_threshold_oz,
            p_max_stock_oz,
            v_gfs_code,
            p_pack_size_oz,
            true
        )
        returning id into v_id;

        v_action := 'ingredient_created';
    else
        select *
        into v_before
        from public.ingredients as ingredient
        where ingredient.id = p_ingredient_id
          and ingredient.is_active
        for update;

        if not found then
            raise exception 'Active ingredient % was not found', p_ingredient_id;
        end if;

        if v_reason is null then
            raise exception 'A reason is required when updating an ingredient';
        end if;

        update public.ingredients
        set
            name = v_name,
            current_stock_oz = p_current_stock_oz,
            low_stock_threshold_oz = p_low_stock_threshold_oz,
            max_stock_oz = p_max_stock_oz,
            gfs_code = v_gfs_code,
            pack_size_oz = p_pack_size_oz
        where id = p_ingredient_id;

        v_id := p_ingredient_id;
        v_action := 'ingredient_updated';

        if (
            v_before.current_stock_oz is distinct from p_current_stock_oz
            or v_before.low_stock_threshold_oz
                is distinct from p_low_stock_threshold_oz
            or v_before.max_stock_oz is distinct from p_max_stock_oz
        ) then
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
                v_reason,
                nullif(btrim(p_changed_by), '')
            );
        end if;
    end if;

    insert into public.inventory_setup_activity (
        action,
        entity_type,
        entity_id,
        entity_name,
        details,
        changed_by
    )
    values (
        v_action,
        'ingredient',
        v_id::text,
        v_name,
        jsonb_build_object(
            'before',
            case
                when p_ingredient_id is null then null
                else jsonb_build_object(
                    'name', v_before.name,
                    'current_stock_oz', v_before.current_stock_oz,
                    'low_stock_threshold_oz',
                        v_before.low_stock_threshold_oz,
                    'max_stock_oz', v_before.max_stock_oz,
                    'gfs_code', v_before.gfs_code,
                    'pack_size_oz', v_before.pack_size_oz
                )
            end,
            'after',
            jsonb_build_object(
                'name', v_name,
                'current_stock_oz', p_current_stock_oz,
                'low_stock_threshold_oz', p_low_stock_threshold_oz,
                'max_stock_oz', p_max_stock_oz,
                'gfs_code', v_gfs_code,
                'pack_size_oz', p_pack_size_oz
            ),
            'reason', coalesce(v_reason, 'Initial ingredient setup')
        ),
        nullif(btrim(p_changed_by), '')
    );

    return v_id;
end;
$$;

create or replace function public.archive_owner_ingredient(
    p_ingredient_id integer,
    p_changed_by text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_name text;
begin
    select ingredient.name
    into v_name
    from public.ingredients as ingredient
    where ingredient.id = p_ingredient_id
      and ingredient.is_active
    for update;

    if not found then
        raise exception 'Active ingredient % was not found', p_ingredient_id;
    end if;

    if exists (
        select 1
        from public.recipe_ingredients as recipe_ingredient
        join public.menu_items as menu_item
          on menu_item.recipe_id = recipe_ingredient.recipe_id
        where recipe_ingredient.ingredient_id = p_ingredient_id
          and menu_item.is_active
    ) then
        raise exception
            'Ingredient % is still used by an active menu item',
            v_name;
    end if;

    update public.ingredients
    set is_active = false
    where id = p_ingredient_id;

    insert into public.inventory_setup_activity (
        action,
        entity_type,
        entity_id,
        entity_name,
        changed_by
    )
    values (
        'ingredient_archived',
        'ingredient',
        p_ingredient_id::text,
        v_name,
        nullif(btrim(p_changed_by), '')
    );

    return true;
end;
$$;

create or replace function public.save_owner_menu_item(
    p_menu_item_id integer,
    p_item_name text,
    p_square_item_id text,
    p_recipe_lines jsonb,
    p_changed_by text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_menu_item_id integer;
    v_recipe_id uuid;
    v_existing_square_item_id text;
    v_existing_item_name text;
    v_before_recipe_lines jsonb := '[]'::jsonb;
    v_item_name text := btrim(coalesce(p_item_name, ''));
    v_square_item_id text := btrim(coalesce(p_square_item_id, ''));
    v_line jsonb;
    v_ingredient_id integer;
    v_quantity numeric;
    v_seen_ingredient_ids integer[] := array[]::integer[];
    v_action text;
begin
    if v_item_name = '' then
        raise exception 'Menu item name is required';
    end if;

    if v_square_item_id = '' then
        raise exception 'Choose a Square menu variation';
    end if;

    if p_recipe_lines is null
       or jsonb_typeof(p_recipe_lines) <> 'array'
       or jsonb_array_length(p_recipe_lines) = 0 then
        raise exception 'A menu item requires at least one ingredient';
    end if;

    if p_menu_item_id is not null then
        select
            menu_item.recipe_id,
            menu_item.square_item_id,
            menu_item.item_name
        into
            v_recipe_id,
            v_existing_square_item_id,
            v_existing_item_name
        from public.menu_items as menu_item
        where menu_item.id = p_menu_item_id
          and menu_item.is_active
        for update;

        if not found then
            raise exception 'Active menu item % was not found', p_menu_item_id;
        end if;

        select coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'ingredient_id', recipe_ingredient.ingredient_id,
                    'quantity_required_oz',
                        recipe_ingredient.quantity_required_oz
                )
                order by recipe_ingredient.ingredient_id
            ),
            '[]'::jsonb
        )
        into v_before_recipe_lines
        from public.recipe_ingredients as recipe_ingredient
        where recipe_ingredient.recipe_id = v_recipe_id;
    end if;

    if (
        p_menu_item_id is null
        or v_square_item_id <> v_existing_square_item_id
    ) and not exists (
        select 1
        from public.square_catalog_variations as catalog
        where catalog.square_variation_id = v_square_item_id
          and catalog.is_available
    ) then
        raise exception
            'Refresh the Square catalog and choose an available variation';
    end if;

    if exists (
        select 1
        from public.menu_items as menu_item
        where menu_item.is_active
          and menu_item.square_item_id = v_square_item_id
          and (
              p_menu_item_id is null
              or menu_item.id <> p_menu_item_id
          )
    ) then
        raise exception 'That Square variation is already tracked';
    end if;

    if exists (
        select 1
        from public.menu_items as menu_item
        where menu_item.is_active
          and lower(btrim(menu_item.item_name)) = lower(v_item_name)
          and (
              p_menu_item_id is null
              or menu_item.id <> p_menu_item_id
          )
    ) then
        raise exception 'An active menu item named % already exists', v_item_name;
    end if;

    for v_line in
        select value from jsonb_array_elements(p_recipe_lines)
    loop
        begin
            v_ingredient_id := (v_line ->> 'ingredient_id')::integer;
            v_quantity := (v_line ->> 'quantity_required_oz')::numeric;
        exception
            when invalid_text_representation then
                raise exception 'Every recipe row needs a valid ingredient and amount';
        end;

        if v_ingredient_id is null or not exists (
            select 1
            from public.ingredients as ingredient
            where ingredient.id = v_ingredient_id
              and ingredient.is_active
        ) then
            raise exception 'Recipe ingredient % is unavailable', v_ingredient_id;
        end if;

        if v_quantity is null or v_quantity <= 0 then
            raise exception 'Every recipe amount must be greater than zero';
        end if;

        if v_ingredient_id = any(v_seen_ingredient_ids) then
            raise exception 'An ingredient can only appear once in a recipe';
        end if;

        v_seen_ingredient_ids := array_append(
            v_seen_ingredient_ids,
            v_ingredient_id
        );
    end loop;

    if p_menu_item_id is null then
        insert into public.recipes (name, description)
        values (v_item_name || ' Recipe', 'Owner-managed recipe')
        returning id into v_recipe_id;

        insert into public.menu_items (
            item_name,
            square_item_id,
            item_code,
            recipe_id,
            is_active
        )
        values (
            v_item_name,
            v_square_item_id,
            'OWNER-' || upper(left(md5(v_square_item_id), 12)),
            v_recipe_id,
            true
        )
        returning id into v_menu_item_id;

        v_action := 'menu_item_created';
    else
        update public.menu_items
        set
            item_name = v_item_name,
            square_item_id = v_square_item_id
        where id = p_menu_item_id;

        update public.recipes
        set name = v_item_name || ' Recipe'
        where id = v_recipe_id;

        v_menu_item_id := p_menu_item_id;
        v_action := 'menu_item_updated';
    end if;

    delete from public.recipe_ingredients
    where recipe_id = v_recipe_id;

    for v_line in
        select value from jsonb_array_elements(p_recipe_lines)
    loop
        insert into public.recipe_ingredients (
            recipe_id,
            ingredient_id,
            quantity_required_oz
        )
        values (
            v_recipe_id,
            (v_line ->> 'ingredient_id')::integer,
            (v_line ->> 'quantity_required_oz')::numeric
        );
    end loop;

    insert into public.inventory_setup_activity (
        action,
        entity_type,
        entity_id,
        entity_name,
        details,
        changed_by
    )
    values (
        v_action,
        'menu_item',
        v_menu_item_id::text,
        v_item_name,
        jsonb_build_object(
            'before',
            case
                when p_menu_item_id is null then null
                else jsonb_build_object(
                    'item_name', v_existing_item_name,
                    'square_item_id', v_existing_square_item_id,
                    'recipe_lines', v_before_recipe_lines
                )
            end,
            'after',
            jsonb_build_object(
                'item_name', v_item_name,
                'square_item_id', v_square_item_id,
                'recipe_lines', p_recipe_lines
            )
        ),
        nullif(btrim(p_changed_by), '')
    );

    return v_menu_item_id;
end;
$$;

create or replace function public.archive_owner_menu_item(
    p_menu_item_id integer,
    p_changed_by text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_name text;
begin
    select menu_item.item_name
    into v_name
    from public.menu_items as menu_item
    where menu_item.id = p_menu_item_id
      and menu_item.is_active
    for update;

    if not found then
        raise exception 'Active menu item % was not found', p_menu_item_id;
    end if;

    update public.menu_items
    set is_active = false
    where id = p_menu_item_id;

    insert into public.inventory_setup_activity (
        action,
        entity_type,
        entity_id,
        entity_name,
        changed_by
    )
    values (
        'menu_item_archived',
        'menu_item',
        p_menu_item_id::text,
        v_name,
        nullif(btrim(p_changed_by), '')
    );

    return true;
end;
$$;

create or replace function public.validate_inventory_setup()
returns table (
    issue_key text,
    severity text,
    area text,
    entity_id text,
    message text
)
language sql
stable
security invoker
set search_path = public
as $$
    select
        'ingredient-stock-' || ingredient.id as issue_key,
        'error'::text as severity,
        'ingredient'::text as area,
        ingredient.id::text as entity_id,
        ingredient.name || ' has invalid current stock.' as message
    from public.ingredients as ingredient
    where ingredient.is_active
      and (
          ingredient.current_stock_oz is null
          or ingredient.current_stock_oz < 0
      )

    union all

    select
        'ingredient-levels-' || ingredient.id,
        'error',
        'ingredient',
        ingredient.id::text,
        ingredient.name || ' needs a valid threshold and maximum.'
    from public.ingredients as ingredient
    where ingredient.is_active
      and (
          ingredient.low_stock_threshold_oz is null
          or ingredient.low_stock_threshold_oz < 0
          or ingredient.max_stock_oz is null
          or ingredient.max_stock_oz <= 0
          or ingredient.low_stock_threshold_oz > ingredient.max_stock_oz
      )

    union all

    select
        'ingredient-receiving-' || ingredient.id,
        'warning',
        'ingredient',
        ingredient.id::text,
        ingredient.name || ' cannot use pack delivery intake until both GFS code and pack size are set.'
    from public.ingredients as ingredient
    where ingredient.is_active
      and (
          (nullif(btrim(ingredient.gfs_code), '') is null)
          <> (ingredient.pack_size_oz is null)
          or ingredient.pack_size_oz <= 0
      )

    union all

    select
        'menu-recipe-' || menu_item.id,
        'error',
        'menu_item',
        menu_item.id::text,
        menu_item.item_name || ' has no complete recipe.'
    from public.menu_items as menu_item
    where menu_item.is_active
      and (
          menu_item.recipe_id is null
          or not exists (
              select 1
              from public.recipe_ingredients as recipe_ingredient
              where recipe_ingredient.recipe_id = menu_item.recipe_id
          )
      )

    union all

    select
        'menu-quantity-' || menu_item.id,
        'error',
        'menu_item',
        menu_item.id::text,
        menu_item.item_name || ' has an invalid recipe amount.'
    from public.menu_items as menu_item
    join public.recipe_ingredients as recipe_ingredient
      on recipe_ingredient.recipe_id = menu_item.recipe_id
    where menu_item.is_active
      and (
          recipe_ingredient.quantity_required_oz is null
          or recipe_ingredient.quantity_required_oz <= 0
      )
    group by menu_item.id, menu_item.item_name

    union all

    select
        'menu-archived-ingredient-' || menu_item.id,
        'error',
        'menu_item',
        menu_item.id::text,
        menu_item.item_name || ' uses an archived ingredient.'
    from public.menu_items as menu_item
    join public.recipe_ingredients as recipe_ingredient
      on recipe_ingredient.recipe_id = menu_item.recipe_id
    join public.ingredients as ingredient
      on ingredient.id = recipe_ingredient.ingredient_id
    where menu_item.is_active
      and not ingredient.is_active
    group by menu_item.id, menu_item.item_name

    union all

    select
        'menu-square-' || menu_item.id,
        'warning',
        'menu_item',
        menu_item.id::text,
        menu_item.item_name || ' is not present in the latest Square catalog refresh.'
    from public.menu_items as menu_item
    where menu_item.is_active
      and not exists (
          select 1
          from public.square_catalog_variations as catalog
          where catalog.square_variation_id = menu_item.square_item_id
            and catalog.is_available
      )

    order by severity, area, message;
$$;

-- Keep archived menu items outside the live Square deduction scope.
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
              and menu_item.is_active
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
        where menu_item.square_item_id = v_square_item_id
          and menu_item.is_active;

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
            join public.ingredients as ingredient
              on ingredient.id = recipe_ingredient.ingredient_id
            where recipe_ingredient.recipe_id = v_recipe_id
              and (
                  recipe_ingredient.quantity_required_oz is null
                  or recipe_ingredient.quantity_required_oz <= 0
                  or not ingredient.is_active
              )
        ) then
            raise exception
                'Tracked Square item % has an invalid recipe',
                v_square_item_id;
        end if;

        v_tracked_line_count := v_tracked_line_count + 1;

        with deductions as (
            select
                recipe_ingredient.ingredient_id,
                sum(recipe_ingredient.quantity_required_oz) as quantity_oz
            from public.recipe_ingredients as recipe_ingredient
            join public.ingredients as ingredient
              on ingredient.id = recipe_ingredient.ingredient_id
             and ingredient.is_active
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
              and ingredient.is_active
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

revoke all on table public.square_catalog_variations
from public, anon, authenticated;

revoke all on table public.inventory_setup_activity
from public, anon, authenticated;

grant all on table public.square_catalog_variations to service_role;
grant all on table public.inventory_setup_activity to service_role;

revoke all on function public.replace_square_catalog_cache(jsonb, text)
from public, anon, authenticated;

revoke all on function public.save_owner_ingredient(
    integer,
    text,
    numeric,
    numeric,
    numeric,
    text,
    numeric,
    text,
    text
) from public, anon, authenticated;

revoke all on function public.archive_owner_ingredient(integer, text)
from public, anon, authenticated;

revoke all on function public.save_owner_menu_item(
    integer,
    text,
    text,
    jsonb,
    text
) from public, anon, authenticated;

revoke all on function public.archive_owner_menu_item(integer, text)
from public, anon, authenticated;

revoke all on function public.validate_inventory_setup()
from public, anon, authenticated;

grant execute on function public.replace_square_catalog_cache(jsonb, text)
to service_role;

grant execute on function public.save_owner_ingredient(
    integer,
    text,
    numeric,
    numeric,
    numeric,
    text,
    numeric,
    text,
    text
) to service_role;

grant execute on function public.archive_owner_ingredient(integer, text)
to service_role;

grant execute on function public.save_owner_menu_item(
    integer,
    text,
    text,
    jsonb,
    text
) to service_role;

grant execute on function public.archive_owner_menu_item(integer, text)
to service_role;

grant execute on function public.validate_inventory_setup()
to service_role;

commit;
