export type StockReceipt = {
    ingredient_id: number;
    ingredient_name: string;
    pack_count: number;
    pack_size_oz: number;
    stock_added_oz: number;
    stock_after_oz: number;
};

type RpcResult = {
    data: unknown;
    error: { message?: string } | null;
};

export type StockReceivingClient = {
    rpc(
        functionName: string,
        args: Record<string, unknown>
    ): PromiseLike<RpcResult>;
};

export function parsePackCount(value: string): number {
    const packCount = Number(value);

    if (!Number.isFinite(packCount) || packCount <= 0) {
        throw new Error('Pack count must be a positive number');
    }

    return packCount;
}

function isStockReceipt(value: unknown): value is StockReceipt {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const receipt = value as Partial<StockReceipt>;

    return (
        typeof receipt.ingredient_id === 'number'
        && typeof receipt.ingredient_name === 'string'
        && typeof receipt.pack_count === 'number'
        && typeof receipt.pack_size_oz === 'number'
        && typeof receipt.stock_added_oz === 'number'
        && typeof receipt.stock_after_oz === 'number'
    );
}

export async function receiveStockDelivery(
    supabase: StockReceivingClient,
    gfsCode: string,
    packCount: number,
    receivedBy?: string
): Promise<StockReceipt> {
    const normalizedCode = gfsCode.trim();

    if (!normalizedCode) {
        throw new Error('GFS code is required');
    }

    if (!Number.isFinite(packCount) || packCount <= 0) {
        throw new Error('Pack count must be a positive number');
    }

    const { data, error } = await supabase.rpc('receive_stock_delivery', {
        p_gfs_code: normalizedCode,
        p_pack_count: packCount,
        p_received_by: receivedBy?.trim() || null
    });

    if (error) {
        throw new Error(
            `Failed to receive stock for ${normalizedCode}: ${error.message ?? 'unknown database error'}`
        );
    }

    if (!isStockReceipt(data)) {
        throw new Error('Supabase returned an invalid stock receipt');
    }

    return data;
}
