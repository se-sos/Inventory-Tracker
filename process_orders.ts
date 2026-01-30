import { Client, Environment } from 'square';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// Configuration
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// State File for tracking last sync time
const STATE_FILE = path.join(__dirname, 'last_sync_state.json');

if (!SQUARE_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing environment variables. Please check .env file.');
    process.exit(1);
}

const square = new Client({
    accessToken: SQUARE_ACCESS_TOKEN,
    environment: SQUARE_ENVIRONMENT,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

// Helper for Delay
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

            // 2. Process Each Order
            for (const order of orders) {
                if (!order.lineItems) continue;

                for (const item of order.lineItems) {
                    const squareItemId = item.catalogObjectId;
                    const quantitySold = parseInt(item.quantity);

                    if (!squareItemId) continue;

                    // A. Find Supabase Menu Item & Linked Recipe
                    const { data: menuItem } = await supabase
                        .from('menu_items')
                        .select('id, item_name, recipe_id')
                        .eq('square_item_id', squareItemId)
                        .single();

                    if (!menuItem) continue; // Skip unknown items

                    let recipeId = menuItem.recipe_id;

                    // Fallback: If no recipe_id, try to find one by name (optional, but good for transition)
                    // Or just skip. For now, we assume migration worked.
                    if (!recipeId) {
                        console.log(`    - Warning: Item "${menuItem.item_name}" has no linked recipe.`);
                        continue;
                    }

                    // B. Fetch Ingredients for this Recipe
                    const { data: ingredients } = await supabase
                        .from('recipe_ingredients')
                        .select(`
                            quantity_required_oz,
                            ingredient:ingredients (id, name, current_stock_oz)
                        `)
                        .eq('recipe_id', recipeId);

                    if (!ingredients || ingredients.length === 0) continue;

                    // C. Deduct Inventory
                    for (const entry of ingredients) {
                        // Type assertion because of the join
                        const ingData = entry.ingredient as any;
                        if (!ingData) continue;

                        const totalDeduct = entry.quantity_required_oz * quantitySold;
                        const newStock = ingData.current_stock_oz - totalDeduct;

                        await supabase
                            .from('ingredients')
                            .update({ current_stock_oz: newStock })
                            .eq('id', ingData.id);

                        console.log(`    - Deducted ${totalDeduct}oz ${ingData.name} (Now: ${newStock}oz)`);
                    }
                }
            }
        } else {
            console.log('  > No new orders.');
        }

        // 3. Update Sync Time ONLY if successful
        saveSyncTime(endTime);

    } catch (error) {
        console.error('  [ERROR] Sync failed this run:', error);
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
