import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

async function simulateOrder(squareItemId: string, quantity: number) {
    console.log(`\n[SIMULATION] Processing Fake Order: Item ${squareItemId} x ${quantity}`);

    // 1. Find Menu Item & Recipe
    const { data: menuItem, error: menuError } = await supabase
        .from('menu_items')
        .select('id, item_name, recipe_id')
        .eq('square_item_id', squareItemId)
        .single();

    if (menuError || !menuItem) {
        console.error('Error finding Menu Item:', menuError?.message || 'Item not found');
        return;
    }
    console.log(`  > Found Item: ${menuItem.item_name}`);

    if (!menuItem.recipe_id) {
        console.error('  > [ERROR] This item is not linked to any Recipe!');
        return;
    }

    // 2. Fetch Ingredients for Recipe
    const { data: ingredients, error: recipeError } = await supabase
        .from('recipe_ingredients')
        .select(`
            quantity_required_oz,
            ingredient:ingredients (id, name, current_stock_oz)
        `)
        .eq('recipe_id', menuItem.recipe_id);

    if (recipeError) {
        console.error('Error fetching recipe:', recipeError.message);
        return;
    }

    if (!ingredients || ingredients.length === 0) {
        console.log('  > Recipe has no ingredients defined.');
        return;
    }

    // 3. Deduct Stock
    for (const entry of ingredients) {
        const ingData = entry.ingredient as any;
        if (!ingData) continue;

        const totalDeduct = entry.quantity_required_oz * quantity;
        const newStock = ingData.current_stock_oz - totalDeduct;

        console.log(`  > Ingredient: ${ingData.name}`);
        console.log(`    - Required: ${entry.quantity_required_oz}oz per item`);
        console.log(`    - Total Deduct: ${totalDeduct}oz`);
        console.log(`    - Old Stock: ${ingData.current_stock_oz}oz`);
        console.log(`    - New Stock: ${newStock}oz`);

        // Perform Update
        const { error: updateError } = await supabase
            .from('ingredients')
            .update({ current_stock_oz: newStock })
            .eq('id', ingData.id);

        if (updateError) console.error(`    [ERROR] Failed to update stock: ${updateError.message}`);
        else console.log(`    [SUCCESS] Stock updated.`);
    }
}

// Default run: Simulate 6 Large Coffees (expect 60oz deduction)
const TEST_ID = 'ITEM_COFFEE_BIG';
const TEST_QTY = 6;

simulateOrder(TEST_ID, TEST_QTY);
