import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing environment variables. Please check .env file.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function receiveStock(code: string, qtyToAdd: number) {
    console.log(`\n--- Receiving Stock: ${code} (Qty: ${qtyToAdd}) ---`);

    // 1. Lookup Ingredient by GFS Code
    const { data: ingredient, error: findError } = await supabase
        .from('ingredients')
        .select('*')
        .eq('gfs_code', code)
        .single();

    if (findError || !ingredient) {
        console.error(`[ERROR] Item not found with GFS Code: "${code}"`);
        console.log('Tip: Check if the barcode matches the "gfs_code" in your database.');
        return;
    }

    console.log(`Found: ${ingredient.name}`);
    console.log(`Current Stock: ${ingredient.current_stock_oz}`);

    // 2. Calculate New Stock
    const newStock = ingredient.current_stock_oz + qtyToAdd;

    // 3. Update Database
    const { data: updated, error: updateError } = await supabase
        .from('ingredients')
        .update({ current_stock_oz: newStock })
        .eq('id', ingredient.id)
        .select()
        .single();

    if (updateError) {
        console.error('[ERROR] Failed to update stock:', updateError.message);
    } else {
        console.log(`[SUCCESS] Added ${qtyToAdd} to inventory.`);
        console.log(`New Stock Level: ${updated.current_stock_oz}`);
    }
}

// CLI Argument Handling
const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Usage: npx ts-node receive_stock.ts <GFS_CODE> <QUANTITY>');
    console.log('Example: npx ts-node receive_stock.ts BEAN-001 50');
} else {
    const code = args[0];
    const qty = parseFloat(args[1]);

    if (isNaN(qty)) {
        console.error('Error: Quantity must be a number.');
    } else {
        receiveStock(code, qty);
    }
}
