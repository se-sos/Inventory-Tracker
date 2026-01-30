import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

async function listMenuItems() {
    const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .limit(5);

    if (error) console.error(error);
    else console.log(data);
}

listMenuItems();
