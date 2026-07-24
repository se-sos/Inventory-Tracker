import { createSupabaseAdminClient } from './supabase_admin';

const supabase = createSupabaseAdminClient();

async function listMenuItems() {
    const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .limit(5);

    if (error) console.error(error);
    else console.log(data);
}

listMenuItems();
