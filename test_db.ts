import { createSupabaseAdminClient } from './supabase_admin';

const supabase = createSupabaseAdminClient();

async function testConnection() {
    console.log('Testing Supabase connection...');
    try {
        // Try to select from the inventory table to check connection AND table existence
        const { data, error } = await supabase.from('inventory').select('count').limit(1);

        if (error) {
            console.error('Supabase Error:', error.message);
            console.error('Details:', error);
            if (error.code === 'PGRST204') {
                console.error('TIP: Data table not found. Did you run the schema.sql in Supabase?');
            }
        } else {
            console.log('Success! Connected to Supabase and found "inventory" table.');
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

testConnection();
