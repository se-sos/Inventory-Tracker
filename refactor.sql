-- 1. Rename old junction table (Safely)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'recipes') AND 
       NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'old_recipes') THEN
        ALTER TABLE public.recipes RENAME TO old_recipes;
    END IF;
END $$;

-- 2. Create new normalized tables (Corrected)
CREATE TABLE IF NOT EXISTS public.recipes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    original_menu_item_id integer -- Helper to map back during migration
);

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    recipe_id uuid REFERENCES public.recipes(id) ON DELETE CASCADE,
    ingredient_id integer REFERENCES public.ingredients(id) ON DELETE CASCADE,
    quantity_required_oz numeric NOT NULL
);

-- 3. Update Menu Items
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.recipes(id);

-- 4. Migrate Data
-- Method:
-- A. Insert new Recipes (generating NEW UUIDs), but keeping track of the old integer ID in 'original_menu_item_id'
INSERT INTO public.recipes (name, description, original_menu_item_id)
SELECT DISTINCT m.item_name, 'Auto-migrated', m.id
FROM public.menu_items m
JOIN public.old_recipes o ON m.id = o.menu_item_id
WHERE NOT EXISTS (SELECT 1 FROM public.recipes WHERE original_menu_item_id = m.id);

-- B. Link Menu Items to the NEW Recipe UUIDs
UPDATE public.menu_items m
SET recipe_id = r.id
FROM public.recipes r
WHERE m.id = r.original_menu_item_id;

-- C. Migrate Ingredients using the mapping
INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_required_oz)
SELECT r.id, o.ingredient_id, o.quantity_required_oz
FROM public.old_recipes o
JOIN public.recipes r ON o.menu_item_id = r.original_menu_item_id;

-- 5. Cleanup helper column (Optional, but cleaner)
-- ALTER TABLE public.recipes DROP COLUMN original_menu_item_id;
