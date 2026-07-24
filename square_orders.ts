import {
    Order,
    SearchOrdersRequest,
    SearchOrdersResponse
} from 'square';

export type OrdersSearchClient = {
    searchOrders(
        request: SearchOrdersRequest
    ): PromiseLike<{ result: SearchOrdersResponse }>;
};

export async function fetchAllCompletedOrders(
    ordersApi: OrdersSearchClient,
    beginTime: string,
    endTime: string
): Promise<Order[]> {
    const orders: Order[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    do {
        const { result } = await ordersApi.searchOrders({
            cursor,
            limit: 1000,
            query: {
                filter: {
                    stateFilter: { states: ['COMPLETED'] },
                    dateTimeFilter: {
                        closedAt: {
                            startAt: beginTime,
                            endAt: endTime
                        }
                    }
                },
                sort: {
                    sortField: 'CLOSED_AT',
                    sortOrder: 'ASC'
                }
            }
        });

        orders.push(...(result.orders ?? []));
        cursor = result.cursor;

        if (cursor) {
            if (seenCursors.has(cursor)) {
                throw new Error(
                    `Square returned the same pagination cursor twice: ${cursor}`
                );
            }

            seenCursors.add(cursor);
        }
    } while (cursor);

    return orders;
}
