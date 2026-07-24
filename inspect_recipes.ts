import { createSupabaseAdminClient } from './supabase_admin';

const supabase = createSupabaseAdminClient();

async function checkRecipes() {
    console.log('Checking recipes table...');
    // Check recipes table
    const { data: recipes, error } = await supabase.from('recipes').select('*').limit(1);
    if (recipes && recipes.length) {
        console.log('RECIPES keys:', Object.keys(recipes[0]));
        console.log('Sample Recipe:', recipes[0]);
    } else {
        console.log('RECIPES table matches found (or empty). Error:', error?.message);
    }

    // Check for a join table like 'recipe_ingredients' or 'menu_item_ingredients'
    // Often it's a many-to-many.
    const possibleTables = ['recipe_ingredients', 'menu_ingredients', 'item_ingredients'];
    for (const t of possibleTables) {
        const { data, error } = await supabase.from(t).select('*').limit(1);
        if (!error) {
            console.log(`Potential Join Table '${t}': FOUND`);
            if (data.length) console.log('  Keys:', Object.keys(data[0]));
        }
    }
}
checkRecipes();
