import { Client, Environment } from 'square';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

// Configuration
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SQUARE_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing environment variables. Please check .env file.');
    process.exit(1);
}

// Initialize Clients
const square = new Client({
    accessToken: SQUARE_ACCESS_TOKEN,
    environment: SQUARE_ENVIRONMENT,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function syncInventory() {
    console.log('Starting inventory sync...');

    try {
        // 1. Fetch all items (Catalog)
        console.log('Fetching catalog...');
        const itemMap = new Map<string, { name: string; sku?: string; square_item_id: string }>();
        let cursor: string | undefined;

        do {
            const { result: catalogResult } = await square.catalogApi.listCatalog(cursor, 'ITEM');
            cursor = catalogResult.cursor;

            if (catalogResult.objects) {
                for (const obj of catalogResult.objects) {
                    if (obj.type === 'ITEM' && obj.itemData && obj.itemData.variations) {
                        for (const variation of obj.itemData.variations) {
                            if (variation.id && variation.itemVariationData) {
                                itemMap.set(variation.id, {
                                    name: `${obj.itemData.name || 'Unknown'} - ${variation.itemVariationData.name || 'Unnamed'}`,
                                    sku: variation.itemVariationData.sku || undefined,
                                    square_item_id: variation.id
                                });
                            }
                        }
                    }
                }
            }
        } while (cursor);

        console.log(`Fetched ${itemMap.size} items from catalog.`);

        // 2. Fetch Inventory Counts in Batches of 1000
        console.log('Fetching inventory counts...');
        const catalogObjectIds = Array.from(itemMap.keys());

        if (catalogObjectIds.length === 0) {
            console.log('No variations found to check inventory for.');
            return;
        }

        const BATCH_SIZE = 1000;
        const updates: any[] = [];

        for (let i = 0; i < catalogObjectIds.length; i += BATCH_SIZE) {
            const batchIds = catalogObjectIds.slice(i, i + BATCH_SIZE);
            console.log(`Fetching batch ${i / BATCH_SIZE + 1} (${batchIds.length} items)...`);

            try {
                const { result: inventoryResult } = await square.inventoryApi.batchRetrieveInventoryCounts({
                    catalogObjectIds: batchIds
                });

                if (inventoryResult.counts) {
                    for (const count of inventoryResult.counts) {
                        if (count.catalogObjectId && count.quantity) {
                            const itemDetails = itemMap.get(count.catalogObjectId);
                            if (itemDetails) {
                                updates.push({
                                    square_item_id: count.catalogObjectId,
                                    sku: itemDetails.sku,
                                    name: itemDetails.name,
                                    quantity: parseInt(count.quantity, 10),
                                    updated_at: new Date().toISOString()
                                });
                            }
                        }
                    }
                }
            } catch (batchError) {
                console.error(`Error fetching batch starting at index ${i}:`, batchError);
                // Continue to next batch instead of failing completely?
                // For now, let's log and continue
            }
        }

        console.log(`Found ${updates.length} inventory records to update.`);

        // 3. Upsert to Supabase in Batches (e.g., 500 records)
        if (updates.length > 0) {
            const SUPABASE_BATCH_SIZE = 500;
            for (let i = 0; i < updates.length; i += SUPABASE_BATCH_SIZE) {
                const batchUpdates = updates.slice(i, i + SUPABASE_BATCH_SIZE);
                console.log(`Upserting Supabase batch ${i / SUPABASE_BATCH_SIZE + 1} (${batchUpdates.length} records)...`);

                const { error } = await supabase
                    .from('inventory')
                    .upsert(batchUpdates, { onConflict: 'square_item_id' });

                if (error) {
                    console.error('Supabase Upsert Error:', error);
                }
            }
            console.log('Successfully synced inventory to Supabase!');
        } else {
            console.log('No updates required.');
        }

    } catch (error) {
        console.error('Sync failed:', error);
        if (error instanceof Error) {
            console.error('Message:', error.message);
        }
    }
}

syncInventory();
