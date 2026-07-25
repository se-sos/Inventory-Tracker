import { SquareClient, SquareEnvironment } from 'square';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import {
    advanceSquareOrderCheckpoint,
    getSquareOrderBeginTime
} from './order_checkpoint';
import { processOrderAtomically } from './order_processing';
import { fetchAllCompletedOrders } from './square_orders';

dotenv.config();

// Configuration
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SQUARE_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
        'Missing SQUARE_ACCESS_TOKEN, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY.'
    );
    process.exit(1);
}

const square = new SquareClient({
    token: SQUARE_ACCESS_TOKEN,
    environment: SQUARE_ENVIRONMENT,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getTrackedSquareItemIds(): Promise<Set<string>> {
    const { data, error } = await supabase
        .from('menu_items')
        .select('square_item_id');

    if (error) {
        throw new Error(
            `Could not load tracked menu items: ${error.message}`
        );
    }

    return new Set(
        (data ?? [])
            .map(row => row.square_item_id)
            .filter((id): id is string => Boolean(id?.trim()))
    );
}

async function processOrders() {
    const endTime = new Date().toISOString(); // Now
    const beginTime = await getSquareOrderBeginTime(supabase, endTime);

    console.log(`[${new Date().toLocaleTimeString()}] Checking orders from ${beginTime} to ${endTime}...`);

    try {
        // 1. Fetch every page of completed orders from Square.
        const orders = await fetchAllCompletedOrders(
            square.orders,
            beginTime,
            endTime
        );
        const trackedSquareItemIds = await getTrackedSquareItemIds();

        if (trackedSquareItemIds.size === 0) {
            throw new Error(
                'No tracked food menu items are configured in Supabase'
            );
        }

        if (orders.length > 0) {
            console.log(`  > Found ${orders.length} new orders.`);

            // 2. Process each order in one idempotent database transaction.
            for (const order of orders) {
                const result = await processOrderAtomically(
                    supabase,
                    order,
                    trackedSquareItemIds
                );

                if (result === 'processed') {
                    console.log(`    - Processed order ${order.id}.`);
                } else if (result === 'duplicate') {
                    console.log(`    - Skipped duplicate order ${order.id}.`);
                } else {
                    console.log(
                        `    - Skipped order ${order.id}; `
                        + 'it had no tracked food items.'
                    );
                }
            }
        } else {
            console.log('  > No new orders.');
        }

        // 3. Advance the durable checkpoint only after every order succeeds.
        await advanceSquareOrderCheckpoint(supabase, endTime);

    } catch (error) {
        console.error('  [ERROR] Sync failed this run:', error);
        throw error;
    }
}

// Main execution: run once per scheduler invocation.
async function main() {
    console.log('--- Starting Square Order Inventory Run ---');

    try {
        await processOrders();
    } catch (fatal) {
        console.error('FATAL process error:', fatal);
        process.exit(1);
    }

    console.log('--- Sync Complete. Exiting. ---');
}

main();
