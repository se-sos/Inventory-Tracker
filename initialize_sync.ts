import { initializeSquareOrderCheckpoint } from './order_checkpoint';
import { createSupabaseAdminClient } from './supabase_admin';

async function main() {
    try {
        const checkpointAt = new Date().toISOString();
        const supabase = createSupabaseAdminClient();

        await initializeSquareOrderCheckpoint(supabase, checkpointAt);

        console.log('Square order tracking is initialized.');
        console.log(`Orders completed after ${checkpointAt} will be processed.`);
    } catch (error) {
        console.error(
            error instanceof Error
                ? error.message
                : 'Square order tracking initialization failed'
        );
        process.exitCode = 1;
    }
}

main();
