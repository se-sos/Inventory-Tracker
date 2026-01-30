import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

async function findAvocado() {
    const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .ilike('name', '%Avocado%');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Found ingredients:', data);
    }
}

findAvocado();
