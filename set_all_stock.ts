import { createSupabaseAdminClient } from './supabase_admin';

const supabase = createSupabaseAdminClient();

async function setAllStock() {
    console.log('Setting all ingredients stock to 100 oz...');

    const { data, error, count } = await supabase
        .from('ingredients')
        .update({ current_stock_oz: 100 })
        .neq('id', -1) // Update all rows
        .select();

    if (error) {
        console.error('Error updating ingredients:', error.message);
    } else {
        console.log(`SUCCESS: Updated ${data.length} ingredients to 100oz.`);
        data.forEach(item => {
            console.log(`- ${item.name}: ${item.current_stock_oz} oz`);
        });
    }
}

setAllStock();
