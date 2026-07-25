export type InventoryStatusInput = {
    id: number;
    name: string;
    current_stock_oz: number;
    low_stock_threshold_oz: number | null;
    max_stock_oz: number | null;
};

export type InventoryStatus = InventoryStatusInput & {
    status: 'ok' | 'reorder' | 'not-configured';
    recommended_add_oz: number | null;
};

export function buildInventoryStatus(
    ingredient: InventoryStatusInput
): InventoryStatus {
    const threshold = ingredient.low_stock_threshold_oz;
    const maximum = ingredient.max_stock_oz;
    const isConfigured = (
        threshold !== null
        && Number.isFinite(threshold)
        && threshold >= 0
        && maximum !== null
        && Number.isFinite(maximum)
        && maximum > 0
        && threshold <= maximum
    );

    if (!isConfigured) {
        return {
            ...ingredient,
            status: 'not-configured',
            recommended_add_oz: null
        };
    }

    if (ingredient.current_stock_oz <= threshold) {
        return {
            ...ingredient,
            status: 'reorder',
            recommended_add_oz: Math.max(
                0,
                maximum - ingredient.current_stock_oz
            )
        };
    }

    return {
        ...ingredient,
        status: 'ok',
        recommended_add_oz: 0
    };
}
