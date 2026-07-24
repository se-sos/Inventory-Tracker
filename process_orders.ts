import { Client, Environment } from 'square';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { processOrderAtomically } from './order_processing';

dotenv.config();

// Configuration
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// State File for tracking last sync time
const STATE_FILE = path.join(__dirname, 'last_sync_state.json');

if (!SQUARE_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
        'Missing SQUARE_ACCESS_TOKEN, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY.'
    );
    process.exit(1);
}

const square = new Client({
    accessToken: SQUARE_ACCESS_TOKEN,
    environment: SQUARE_ENVIRONMENT,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper to get last sync time
function getLastSyncTime(): string {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            return data.last_sync_time;
        }
    } catch (e) {
        console.log('Could not read state file, defaulting to 1 hour ago.');
    }
    // Default to 24 hours ago if no state exists (Daily Catch-up)
    const date = new Date();
    date.setHours(date.getHours() - 24);
    return date.toISOString();
}

// Helper to save new sync time
function saveSyncTime(isoTime: string) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ last_sync_time: isoTime }, null, 2));
}

async function processOrders() {
    const beginTime = getLastSyncTime();
    const endTime = new Date().toISOString(); // Now

    console.log(`[${new Date().toLocaleTimeString()}] Checking orders from ${beginTime} to ${endTime}...`);

    try {
        // 1. Fetch Orders from Square
        const { result: ordersResult } = await square.ordersApi.searchOrders({
            locationIds: [], // Empty array = all locations
            query: {
                filter: {
                    stateFilter: { states: ['COMPLETED'] }, // Only processed orders
                    dateTimeFilter: {
                        closedAt: {
                            startAt: beginTime,
                            endAt: endTime
                        }
                    }
                },
                sort: {
                    sortField: 'CLOSED_AT',
                    sortOrder: 'ASC' // Process oldest first
                }
            }
        });

        const orders = ordersResult?.orders || [];

        if (orders.length > 0) {
            console.log(`  > Found ${orders.length} new orders.`);

            // 2. Process each order in one idempotent database transaction.
            for (const order of orders) {
                const result = await processOrderAtomically(supabase, order);

                if (result === 'processed') {
                    console.log(`    - Processed order ${order.id}.`);
                } else if (result === 'duplicate') {
                    console.log(`    - Skipped duplicate order ${order.id}.`);
                } else {
                    console.log(`    - Skipped order ${order.id}; it had no catalog items.`);
                }
            }
        } else {
            console.log('  > No new orders.');
        }

        // 3. Update Sync Time ONLY if successful
        saveSyncTime(endTime);

    } catch (error) {
        console.error('  [ERROR] Sync failed this run:', error);
        throw error;
    }
}

// Main Execution - Run Once (Daily Job)
async function main() {
    console.log('--- Starting Daily Inventory Sync ---');

    try {
        await processOrders();
    } catch (fatal) {
        console.error('FATAL process error:', fatal);
        process.exit(1);
    }

    console.log('--- Sync Complete. Exiting. ---');
}

// Check for flag to reset time for testing
if (process.argv.includes('--reset')) {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    console.log('Reset sync state.');
}

main();
