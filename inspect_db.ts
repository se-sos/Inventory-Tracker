import { createSupabaseAdminClient } from './supabase_admin';

const supabase = createSupabaseAdminClient();

async function inspectSchema() {
    console.log('Inspecting Supabase schema (Sampling)...');

    const tables = ['menu_items', 'ingredients', 'recipes'];

    for (const table of tables) {
        // Fetch one row to inspect structure
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.log(`Table '${table}': Error (${error.message})`);
        } else {
            console.log(`Table '${table}': FOUND`);
            if (data && data.length > 0) {
                console.log(`  Sample Keys: ${Object.keys(data[0]).join(', ')}`);
                console.log(`  Sample Data: ${JSON.stringify(data[0])}`);
            } else {
                console.log(`  (Table is empty, cannot infer columns)`);
            }
        }
    }
}

inspectSchema();
