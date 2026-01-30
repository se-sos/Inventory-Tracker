import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

// ==========================================
// PASTE YOUR NEW DATA HERE
// ==========================================
const NEW_ITEM = {
    // Top Level: The Menu Item
    name: "Large Coffee",
    square_id: "ITEM_COFFEE_BIG",
    item_code: "COFFEE-LRG",

    // Ingredients needed
    ingredients: [
        {
            name: "Espresso Beans",
            qty_required_oz: 10, // 10oz per order to match user request (6 orders = 60oz)
            gfs_code: "BEAN-ESPRESSO",
            current_stock_oz: 200,
            pack_size_oz: 16 // 1lb bag
        }
    ]
};
// ==========================================

async function addData() {
    console.log(`Adding ${NEW_ITEM.name}...`);

    // 1. Add/Update Menu Item
    const { data: menuItem, error: menuError } = await supabase
        .from('menu_items')
        .upsert({
            item_name: NEW_ITEM.name,
            square_item_id: NEW_ITEM.square_id,
            item_code: NEW_ITEM.item_code
        }, { onConflict: 'square_item_id' })
        .select()
        .single();

    if (menuError) {
        console.error('Menu Item Error:', menuError.message);
        return;
    }
    console.log('-> Menu Item Saved.');

    // 2. Create Recipe (One-to-One with Menu Item implementation for now)
    // We try to find existing recipe or create new one linked to this item's ID?
    // Actually, schema is: Menu Item -> (fk) -> Recipe

    // Create new Recipe
    const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({
            name: `${NEW_ITEM.name} Recipe`,
            description: 'Auto-created via script'
        })
        .select()
        .single();

    if (recipeError) {
        console.error('Recipe Creation Error:', recipeError.message);
        return;
    }
    console.log(`-> Recipe Created: ${recipe.name}`);

    // Link Menu Item to Recipe
    await supabase
        .from('menu_items')
        .update({ recipe_id: recipe.id })
        .eq('id', menuItem.id);

    // 3. Process Ingredients & Link to Recipe
    for (const ing of NEW_ITEM.ingredients) {
        // A. Find or Create Ingredient AND Update Pack Size
        let ingredientId;

        // Try to find by Name or GFS Code
        const { data: existing } = await supabase
            .from('ingredients')
            .select('id')
            .or(`gfs_code.eq.${ing.gfs_code},name.eq.${ing.name}`)
            .maybeSingle();

        if (existing) {
            ingredientId = existing.id;
            console.log(`-> Found existing ingredient: ${ing.name}`);

            // UPDATE Pack Size if provided
            if ((ing as any).pack_size_oz) {
                await supabase
                    .from('ingredients')
                    .update({ pack_size_oz: (ing as any).pack_size_oz })
                    .eq('id', ingredientId);
                console.log(`   (Updated Pack Size to ${(ing as any).pack_size_oz}oz)`);
            }

        } else {
            // Create New
            const { data: newIng, error: ingError } = await supabase
                .from('ingredients')
                .insert({
                    name: ing.name,
                    gfs_code: ing.gfs_code,
                    current_stock_oz: ing.current_stock_oz,
                    pack_size_oz: (ing as any).pack_size_oz
                })
                .select()
                .single();

            if (ingError) {
                console.error(`Error creating ${ing.name}:`, ingError.message);
                continue;
            }
            ingredientId = newIng.id;
            console.log(`-> Created new ingredient: ${ing.name}`);
        }

        // B. Link to Recipe (recipe_ingredients)
        const { error: linkError } = await supabase
            .from('recipe_ingredients')
            .insert({
                recipe_id: recipe.id,
                ingredient_id: ingredientId,
                quantity_required_oz: ing.qty_required_oz
            });

        if (linkError) console.error(`Link Error (${ing.name}):`, linkError.message);
        else console.log(`-> Linked Ingredient: ${ing.qty_required_oz}oz of ${ing.name}`);
    }

    console.log('Done!');
}

addData();
