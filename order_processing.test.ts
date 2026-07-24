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

test('surfaces an unmapped Square item without treating the order as processed', async () => {
    const supabase: SupabaseRpcClient = {
        rpc: async () => ({
            data: null,
            error: {
                message: 'Square item UNKNOWN has no mapped recipe ingredients'
            }
        })
    };

    await assert.rejects(
        () => processOrderAtomically(supabase, {
            id: 'ORDER-UNMAPPED',
            lineItems: [{
                catalogObjectId: 'UNKNOWN',
                quantity: '1'
            }]
        }),
        /UNKNOWN has no mapped recipe ingredients/
    );
});
