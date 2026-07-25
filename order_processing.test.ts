import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildOrderLinePayload,
    processOrderAtomically,
    SupabaseRpcClient
} from './order_processing';

test('builds a database payload without rounding fractional quantities', () => {
    assert.deepEqual(
        buildOrderLinePayload([
            { catalogObjectId: 'COFFEE', quantity: '2' },
            { catalogObjectId: 'MILK', quantity: '1.5' },
            { quantity: '1' }
        ]),
        [
            { square_item_id: 'COFFEE', quantity: 2 },
            { square_item_id: 'MILK', quantity: 1.5 }
        ]
    );
});

test('rejects invalid quantities before touching the database', () => {
    assert.throws(
        () => buildOrderLinePayload([
            { catalogObjectId: 'COFFEE', quantity: 'not-a-number' }
        ]),
        /Invalid quantity/
    );
});

test('keeps only configured food items from a mixed Square order', () => {
    assert.deepEqual(
        buildOrderLinePayload(
            [
                { catalogObjectId: 'TRACKED-FOOD', quantity: '2' },
                { catalogObjectId: 'IGNORED-DRINK', quantity: '1' }
            ],
            new Set(['TRACKED-FOOD'])
        ),
        [{ square_item_id: 'TRACKED-FOOD', quantity: 2 }]
    );
});

test('skips an order containing only untracked Square items', async () => {
    let rpcCalls = 0;
    const supabase: SupabaseRpcClient = {
        rpc: async () => {
            rpcCalls += 1;
            return { data: true, error: null };
        }
    };

    const result = await processOrderAtomically(
        supabase,
        {
            id: 'DRINK-ONLY-ORDER',
            lineItems: [{
                catalogObjectId: 'IGNORED-DRINK',
                quantity: '1'
            }]
        },
        new Set(['TRACKED-FOOD'])
    );

    assert.equal(result, 'skipped');
    assert.equal(rpcCalls, 0);
});

test('ignores malformed quantities on untracked Square items', () => {
    assert.deepEqual(
        buildOrderLinePayload(
            [{
                catalogObjectId: 'IGNORED-DRINK',
                quantity: 'not-a-number'
            }],
            new Set(['TRACKED-FOOD'])
        ),
        []
    );
});

test('treats the database false response as an already processed order', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const supabase: SupabaseRpcClient = {
        rpc: async (functionName, args) => {
            calls.push({ functionName, args });
            return { data: false, error: null };
        }
    };

    const result = await processOrderAtomically(supabase, {
        id: 'ORDER-123',
        locationId: 'LOCATION-1',
        closedAt: '2026-07-23T12:00:00.000Z',
        lineItems: [{ catalogObjectId: 'COFFEE', quantity: '1' }]
    });

    assert.equal(result, 'duplicate');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].functionName, 'process_square_order');
});

test('surfaces a tracked Square item with an incomplete recipe', async () => {
    const supabase: SupabaseRpcClient = {
        rpc: async () => ({
            data: null,
            error: {
                message: 'Tracked Square item TRACKED has no mapped recipe ingredients'
            }
        })
    };

    await assert.rejects(
        () => processOrderAtomically(
            supabase,
            {
                id: 'ORDER-UNMAPPED',
                lineItems: [{
                    catalogObjectId: 'TRACKED',
                    quantity: '1'
                }]
            },
            new Set(['TRACKED'])
        ),
        /TRACKED has no mapped recipe ingredients/
    );
});
