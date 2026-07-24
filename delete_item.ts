import { createSupabaseAdminClient } from './supabase_admin';

const supabase = createSupabaseAdminClient();

async function findAndDelete() {
    console.log('Searching for "Cheese Pizza"...');

    // 1. Find it in MENU_ITEMS
    const { data: items, error } = await supabase
        .from('menu_items')
        .select('*')
        .ilike('item_name', '%Cheese Pizza%');

    if (error) {
        console.error('Error searching:', error.message);
        return;
    }

    if (!items || items.length === 0) {
        console.log('No item found with name containing "Cheese Pizza".');
        return;
    }

    console.log('Found:', items);

    // 2. Delete
    for (const item of items) {
        console.log(`Processing ID ${item.id} (${item.item_name})...`);

        // A. Delete from recipes first (Foreign Key Constraint: menu_item_id)
        const { error: recipeError } = await supabase
            .from('recipes')
            .delete()
            .eq('menu_item_id', item.id);

        if (recipeError) {
            console.log(`  Error deleting dependent recipes: ${recipeError.message}`);
            continue;
        } else {
            console.log(`  Deleted dependent recipes.`);
        }

        // B. Delete the Menu Item
        const { error: delError } = await supabase
            .from('menu_items')
            .delete()
            .eq('id', item.id);

        if (delError) console.error('  Delete failed:', delError.message);
        else console.log('  Deleted Menu Item successfully.');
    }
}

findAndDelete();
