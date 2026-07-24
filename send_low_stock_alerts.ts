import { runLowStockAlerts } from './low_stock_alerts';
import { createSupabaseAdminClient } from './supabase_admin';

function requireEnvironmentVariable(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

async function main() {
    try {
        const supabase = createSupabaseAdminClient();
        const result = await runLowStockAlerts(supabase, {
            apiKey: requireEnvironmentVariable('RESEND_API_KEY'),
            from: requireEnvironmentVariable('ALERT_EMAIL_FROM'),
            to: requireEnvironmentVariable('ALERT_EMAIL_TO')
                .split(',')
                .map(address => address.trim())
                .filter(Boolean)
        });

        if (result.sent) {
            console.log(
                `Sent one low-stock email covering ${result.claimed} ingredient(s).`
            );
        } else {
            console.log('No newly low-stock ingredients.');
        }
    } catch (error) {
        console.error(
            error instanceof Error ? error.message : 'Low-stock alert run failed'
        );
        process.exitCode = 1;
    }
}

main();
