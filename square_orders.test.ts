import assert from 'node:assert/strict';
import test from 'node:test';
import {
    fetchAllCompletedOrders,
    OrdersSearchClient
} from './square_orders';

test('fetches every Square order page in chronological query order', async () => {
    const cursors: Array<string | undefined> = [];
    const ordersApi: OrdersSearchClient = {
        searchOrders: async request => {
            cursors.push(request.cursor);

            if (!request.cursor) {
                return {
                    result: {
                        orders: [{
                            id: 'ORDER-1',
                            locationId: 'LOCATION-1'
                        }],
                        cursor: 'NEXT-PAGE'
                    }
                };
            }

            return {
                result: {
                    orders: [{
                        id: 'ORDER-2',
                        locationId: 'LOCATION-1'
                    }]
                }
            };
        }
    };

    const orders = await fetchAllCompletedOrders(
        ordersApi,
        '2026-07-24T00:00:00.000Z',
        '2026-07-25T00:00:00.000Z'
    );

    assert.deepEqual(cursors, [undefined, 'NEXT-PAGE']);
    assert.deepEqual(
        orders.map(order => order.id),
        ['ORDER-1', 'ORDER-2']
    );
});

test('stops a repeated Square cursor from causing an infinite loop', async () => {
    const ordersApi: OrdersSearchClient = {
        searchOrders: async () => ({
            result: {
                orders: [],
                cursor: 'STUCK'
            }
        })
    };

    await assert.rejects(
        () => fetchAllCompletedOrders(
            ordersApi,
            '2026-07-24T00:00:00.000Z',
            '2026-07-25T00:00:00.000Z'
        ),
        /same pagination cursor twice/
    );
});
