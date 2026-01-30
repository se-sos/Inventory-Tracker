import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

async function checkIng() {
    const { data, error } = await supabase
        .from('ingredients')
        .select('name, current_stock_oz, pack_size_oz')
        .order('name');

    if (error) {
        console.error('Error fetching ingredients:', error);
        return;
    }

    if (data && data.length) {
        console.log(`\n--- Inventory Status (${data.length} items) ---`);
        data.forEach(item => {
            let status = `${item.name}: ${item.current_stock_oz} oz`;
            if (item.pack_size_oz) {
                const packs = (item.current_stock_oz / item.pack_size_oz).toFixed(1);
                status += ` (~${packs} Packs)`;
            }
            console.log(status);
        });
    } else {
        console.log('INGREDIENTS table is empty');
    }
}
checkIng();
