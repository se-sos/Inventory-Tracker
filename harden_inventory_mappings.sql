-- Run once before enabling live order processing.
-- The processor requires one Square variation per tracked menu item and one
-- quantity row per recipe/ingredient pair.

begin;

do $$
begin
    if exists (
        select 1
        from public.menu_items
        where square_item_id is not null
        group by square_item_id
        having count(*) > 1
    ) then
        raise exception
            'Duplicate menu_items.square_item_id values must be resolved first';
    end if;

    if exists (
        select 1
        from public.recipe_ingredients
        group by recipe_id, ingredient_id
        having count(*) > 1
    ) then
        raise exception
            'Duplicate recipe/ingredient rows must be resolved first';
    end if;

    if exists (
        select 1
        from public.menu_items
        where square_item_id is null or recipe_id is null
    ) then
        raise exception
            'Every tracked menu item must have a Square ID and recipe';
    end if;

    if exists (
        select 1
        from public.recipe_ingredients
        where recipe_id is null or ingredient_id is null
    ) then
        raise exception
            'Every recipe ingredient row must reference a recipe and ingredient';
    end if;
end;
$$;

alter table public.menu_items
alter column square_item_id set not null,
alter column recipe_id set not null;

alter table public.recipe_ingredients
alter column recipe_id set not null,
alter column ingredient_id set not null;

create unique index if not exists menu_items_square_item_id_tracking_unique
on public.menu_items (square_item_id);

create unique index if not exists recipe_ingredients_recipe_ingredient_unique
on public.recipe_ingredients (recipe_id, ingredient_id);

commit;
