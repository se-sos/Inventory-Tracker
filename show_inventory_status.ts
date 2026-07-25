import {
    buildOwnerInventoryReport,
    renderOwnerInventoryReport
} from './owner_inventory_report';
import { InventoryStatusInput } from './inventory_status';
import { createSupabaseAdminClient } from './supabase_admin';

function isInventoryRow(value: unknown): value is InventoryStatusInput {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const row = value as Partial<InventoryStatusInput>;

    return (
        typeof row.id === 'number'
        && typeof row.name === 'string'
        && typeof row.current_stock_oz === 'number'
        && (
            row.low_stock_threshold_oz === null
            || typeof row.low_stock_threshold_oz === 'number'
        )
        && (
            row.max_stock_oz === null
            || typeof row.max_stock_oz === 'number'
        )
    );
}

async function main() {
    try {
        const supabase = createSupabaseAdminClient();
        const { data, error } = await supabase
            .from('ingredients')
            .select([
                'id',
                'name',
                'current_stock_oz',
                'low_stock_threshold_oz',
                'max_stock_oz'
            ].join(','));

        if (error) {
            throw new Error(`Could not load inventory: ${error.message}`);
        }

        const rows: unknown = data;

        if (!Array.isArray(rows) || !rows.every(isInventoryRow)) {
            throw new Error('Supabase returned invalid inventory data');
        }

        const report = buildOwnerInventoryReport(rows);
        console.log(renderOwnerInventoryReport(report));
    } catch (error) {
        console.error(
            error instanceof Error
                ? error.message
                : 'Inventory report failed'
        );
        process.exitCode = 1;
    }
}

main();
