import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase variables in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
