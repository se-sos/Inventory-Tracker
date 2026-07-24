type SquareLineItem = {
    catalogObjectId?: string | null;
    quantity?: string | null;
};

export type SquareOrder = {
    id?: string | null;
    locationId?: string | null;
    closedAt?: string | null;
    lineItems?: SquareLineItem[] | null;
};

export type OrderLinePayload = {
    square_item_id: string;
    quantity: number;
};

type RpcResult = {
    data: unknown;
    error: { message?: string } | null;
};

export type SupabaseRpcClient = {
    rpc(
        functionName: string,
        args: Record<string, unknown>
    ): PromiseLike<RpcResult>;
};

export function buildOrderLinePayload(
    lineItems: SquareLineItem[] | null | undefined
): OrderLinePayload[] {
    const payload: OrderLinePayload[] = [];

    for (const item of lineItems ?? []) {
        if (!item.catalogObjectId) {
            continue;
        }

        const quantity = Number(item.quantity);

        if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new Error(
                `Invalid quantity for Square item ${item.catalogObjectId}`
            );
        }

        payload.push({
            square_item_id: item.catalogObjectId,
            quantity
        });
    }

    return payload;
}

export async function processOrderAtomically(
    supabase: SupabaseRpcClient,
    order: SquareOrder
): Promise<'processed' | 'duplicate' | 'skipped'> {
    if (!order.id) {
        throw new Error('Square returned an order without an ID');
    }

    const lineItems = buildOrderLinePayload(order.lineItems);

    if (lineItems.length === 0) {
        return 'skipped';
    }

    const { data, error } = await supabase.rpc('process_square_order', {
        p_square_order_id: order.id,
        p_location_id: order.locationId ?? null,
        p_closed_at: order.closedAt ?? null,
        p_line_items: lineItems
    });

    if (error) {
        throw new Error(
            `Failed to process Square order ${order.id}: ${error.message ?? 'unknown database error'}`
        );
    }

    return data === true ? 'processed' : 'duplicate';
}

