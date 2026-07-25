import {
    buildInventoryStatus,
    InventoryStatus,
    InventoryStatusInput
} from './inventory_status';

export type OwnerInventoryReport = {
    generatedAt: string;
    totalIngredients: number;
    reorderCount: number;
    notConfiguredCount: number;
    items: InventoryStatus[];
};

const statusPriority: Record<InventoryStatus['status'], number> = {
    reorder: 0,
    'not-configured': 1,
    ok: 2
};

export function buildOwnerInventoryReport(
    ingredients: InventoryStatusInput[],
    generatedAt: Date = new Date()
): OwnerInventoryReport {
    const items = ingredients
        .map(buildInventoryStatus)
        .sort((left, right) => (
            statusPriority[left.status] - statusPriority[right.status]
            || left.name.localeCompare(right.name)
        ));

    return {
        generatedAt: generatedAt.toISOString(),
        totalIngredients: items.length,
        reorderCount: items.filter(item => item.status === 'reorder').length,
        notConfiguredCount: items.filter(
            item => item.status === 'not-configured'
        ).length,
        items
    };
}

function displayOunces(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(2)} oz`;
}

export function renderOwnerInventoryReport(
    report: OwnerInventoryReport
): string {
    const lines = [
        'Ghost Coffee inventory report',
        `Generated: ${report.generatedAt}`,
        `Tracked ingredients: ${report.totalIngredients}`,
        `Need reorder: ${report.reorderCount}`,
        `Missing settings: ${report.notConfiguredCount}`,
        '',
        'STATUS | INGREDIENT | CURRENT | THRESHOLD | MAX | ADD'
    ];

    for (const item of report.items) {
        lines.push([
            item.status.toUpperCase(),
            item.name,
            displayOunces(item.current_stock_oz),
            displayOunces(item.low_stock_threshold_oz),
            displayOunces(item.max_stock_oz),
            displayOunces(item.recommended_add_oz)
        ].join(' | '));
    }

    return lines.join('\n');
}
