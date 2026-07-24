import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

function requireEnvironmentVariable(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

export function createSupabaseAdminClient() {
    const url = requireEnvironmentVariable('SUPABASE_URL');
    const serviceRoleKey = requireEnvironmentVariable(
        'SUPABASE_SERVICE_ROLE_KEY'
    );

    return createClient(url, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}
