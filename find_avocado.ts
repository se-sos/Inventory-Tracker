import { createSupabaseAdminClient } from './supabase_admin';

const supabase = createSupabaseAdminClient();

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
