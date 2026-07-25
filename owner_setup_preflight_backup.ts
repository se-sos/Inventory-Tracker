import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const EXPECTED_INGREDIENTS = 30;
const EXPECTED_MENU_ITEMS = 12;
const TABLES = [
    'ingredients',
    'menu_items',
    'recipe_ingredients',
    'processed_orders',
    'integration_checkpoints',
    'inventory_adjustments'
] as const;

function requiredEnvironmentVariable(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

function projectReference(supabaseUrl: string): string {
    const hostname = new URL(supabaseUrl).hostname;
    const suffix = '.supabase.co';

    if (!hostname.endsWith(suffix)) {
        throw new Error('SUPABASE_URL is not a Supabase project URL');
    }

    return hostname.slice(0, -suffix.length);
}

async function main() {
    const expectedProjectReference = process.argv[2]?.trim();

    if (!expectedProjectReference) {
        throw new Error(
            'Pass the intended Supabase project reference as the first argument'
        );
    }

    const supabaseUrl = requiredEnvironmentVariable('SUPABASE_URL');
    const actualProjectReference = projectReference(supabaseUrl);

    if (actualProjectReference !== expectedProjectReference) {
        throw new Error(
            `Target mismatch: expected ${expectedProjectReference}, got ${actualProjectReference}`
        );
    }

    const supabase = createClient(
        supabaseUrl,
        requiredEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY'),
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
    const snapshot: Record<string, unknown[]> = {};

    for (const table of TABLES) {
        const { data, error } = await supabase.from(table).select('*');

        if (error) {
            throw new Error(`Could not back up ${table}: ${error.message}`);
        }

        snapshot[table] = data ?? [];
    }

    const counts = Object.fromEntries(
        Object.entries(snapshot).map(([table, rows]) => [table, rows.length])
    );

    if (counts.ingredients !== EXPECTED_INGREDIENTS) {
        throw new Error(
            `Expected ${EXPECTED_INGREDIENTS} ingredients, found ${counts.ingredients}`
        );
    }

    if (counts.menu_items !== EXPECTED_MENU_ITEMS) {
        throw new Error(
            `Expected ${EXPECTED_MENU_ITEMS} menu items, found ${counts.menu_items}`
        );
    }

    const capturedAt = new Date().toISOString();
    const backup = {
        format: 'ghost-coffee-owner-setup-preflight-v1',
        captured_at: capturedAt,
        supabase_project_reference: actualProjectReference,
        counts,
        tables: snapshot
    };
    const serialized = JSON.stringify(backup, null, 2);
    const digest = crypto
        .createHash('sha256')
        .update(serialized)
        .digest('hex');
    const safeTimestamp = capturedAt.replace(/[:.]/g, '-');
    const backupDirectory = path.join(process.cwd(), 'backups');
    const backupPath = path.join(
        backupDirectory,
        `owner-setup-preflight-${safeTimestamp}.json`
    );

    await fs.mkdir(backupDirectory, { recursive: true });
    await fs.writeFile(backupPath, serialized, {
        encoding: 'utf8',
        flag: 'wx'
    });

    console.log(`Verified Supabase project: ${actualProjectReference}`);
    console.log(`Backup: ${backupPath}`);
    console.log(`SHA-256: ${digest}`);
    console.log(`Ingredients: ${counts.ingredients}`);
    console.log(`Menu items: ${counts.menu_items}`);
    console.log(`Recipe lines: ${counts.recipe_ingredients}`);
    console.log(`Processed orders: ${counts.processed_orders}`);
    console.log('No database rows were changed.');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
