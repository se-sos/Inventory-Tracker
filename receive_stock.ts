import { createSupabaseAdminClient } from './supabase_admin';
import {
    parsePackCount,
    receiveStockDelivery
} from './stock_receiving';

async function main() {
    const [code, rawPackCount, operator] = process.argv.slice(2);

    if (!code || !rawPackCount) {
        console.log(
            'Usage: npx ts-node receive_stock.ts <GFS_CODE> <PACK_COUNT> [RECEIVED_BY]'
        );
        console.log('Example: npx ts-node receive_stock.ts BEAN-001 3 Sean');
        process.exitCode = 1;
        return;
    }

    try {
        const packCount = parsePackCount(rawPackCount);
        const supabase = createSupabaseAdminClient();
        const receipt = await receiveStockDelivery(
            supabase,
            code,
            packCount,
            operator
        );

        console.log(`Received ${receipt.pack_count} pack(s) of ${receipt.ingredient_name}.`);
        console.log(
            `Added ${receipt.stock_added_oz} oz (${receipt.pack_size_oz} oz per pack).`
        );
        console.log(`New stock level: ${receipt.stock_after_oz} oz.`);
    } catch (error) {
        console.error(
            error instanceof Error ? error.message : 'Stock receiving failed'
        );
        process.exitCode = 1;
    }
}

main();
