import { createSupabaseAdminClient } from './supabase_admin';

const supabase = createSupabaseAdminClient();

async function checkNewSchema() {
    console.log('Checking for new tables...');

    // Check recipes
    const { data: recipes, error: rErr } = await supabase.from('recipes').select('*').limit(1);
    if (rErr) console.log('recipes table error:', rErr.message);
    else console.log('recipes table exists. Sample:', recipes);

    // Check recipe_ingredients
    const { data: ri, error: riErr } = await supabase.from('recipe_ingredients').select('*').limit(1);
    if (riErr) console.log('recipe_ingredients error:', riErr.message);
    else console.log('recipe_ingredients exists. Sample:', ri);

    // Check menu_items rel
    const { data: menu, error: mErr } = await supabase.from('menu_items').select('item_name, recipe_id').not('recipe_id', 'is', null).limit(1);
    if (mErr) console.log('menu_items error:', mErr.message);
    else console.log('menu_items linked to recipes:', menu);
}

checkNewSchema();
