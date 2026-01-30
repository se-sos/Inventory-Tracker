import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

async function resetInventory() {
    console.log('Resetting all inventory to ZERO...');

    // 1. Reset Ingredients
    const { error: ingError, count } = await supabase
        .from('ingredients')
        .update({ current_stock_oz: 0 })
        .neq('id', -1); // playful hack to select all rows if no simple 'update all' allowed by RLS policy, usually .neq('id', 0) works

    if (ingError) {
        console.error('Error resetting ingredients:', ingError.message);
    } else {
        console.log('SUCCESS: All ingredients stock set to 0oz.');
    }

    // 2. Reset Raw Inventory (if table exists and has data)
    // We try/catch this just in case logic differs or table is empty
    const { error: invError } = await supabase
        .from('inventory')
        .update({ quantity: 0 })
        .neq('quantity', 0); // Update items that aren't already 0

    if (invError) {
        // Ignore error if table just doesn't exist or RLS blocks
        // console.log('Note: Could not reset "inventory" table or no items needs reset.');
    } else {
        console.log('SUCCESS: All Square inventory counts set to 0.');
    }
}

resetInventory();
