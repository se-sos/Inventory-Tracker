-- CLEANUP SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR

-- 1. Drop the backup table
DROP TABLE IF EXISTS public.old_recipes;

-- 2. Verify we are left with the 4 core tables:
--    - menu_items
--    - recipes
--    - recipe_ingredients
--    - ingredients
--    (plus inventory which is the raw sync table, if you counting that one it makes 5, 
--     but 'old_recipes' was the extra one confusing things).
