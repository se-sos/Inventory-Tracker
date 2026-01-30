import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

async function seedData() {
    console.log('Seeding Coffee Shop Data...');

    // 1. Create Ingredients
    console.log('Creating Ingredients...');
    const { data: ingredients, error: ingError } = await supabase
        .from('ingredients')
        .insert([
            { name: 'Espresso Beans', current_stock_oz: 500, gfs_code: 'BEAN-001' },
            { name: 'Whole Milk', current_stock_oz: 200, gfs_code: 'MILK-001' }
        ])
        .select();

    if (ingError) {
        console.error('Error creating ingredients:', ingError.message);
        return;
    }
    const beans = ingredients.find(i => i.name === 'Espresso Beans');
    const milk = ingredients.find(i => i.name === 'Whole Milk');

    // 2. Create Menu Item (Latte)
    console.log('Creating Menu Item (Latte)...');
    // We use a fake square_item_id here just for testing
    const fakeSquareId = 'ITEM_LATTE_TEST_123';

    const { data: menuItem, error: menuError } = await supabase
        .from('menu_items')
        .insert([
            { item_name: 'Caramel Latte', square_item_id: fakeSquareId, item_code: 'LATTE-001' }
        ])
        .select()
        .single();

    if (menuError) {
        console.error('Error creating menu item:', menuError.message);
        return;
    }

    // 3. Create Recipe (Link them)
    // 2 shots of espresso (approx 0.5oz beans ground?? let's say 1oz for simple math)
    // 8oz of milk
    console.log('Creating Recipe...');
    const { error: recipeError } = await supabase
        .from('recipes')
        .insert([
            { menu_item_id: menuItem.id, ingredient_id: beans.id, quantity_required_oz: 1 },
            { menu_item_id: menuItem.id, ingredient_id: milk.id, quantity_required_oz: 8 }
        ]);

    if (recipeError) {
        console.error('Error creating recipe:', recipeError.message);
    } else {
        console.log('Success! Created "Caramel Latte" with recipe: 1oz Beans + 8oz Milk.');
        console.log(`TESTING NOTE: If you receive a Square Order with catalogObjectId="${fakeSquareId}", the script will deduct ingredients.`);
    }
}

seedData();
