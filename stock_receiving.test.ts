import assert from 'node:assert/strict';
import test from 'node:test';
import {
    parsePackCount,
    receiveStockDelivery,
    StockReceivingClient
} from './stock_receiving';

test('accepts positive whole and fractional pack counts', () => {
    assert.equal(parsePackCount('3'), 3);
    assert.equal(parsePackCount('1.5'), 1.5);
});

test('rejects invalid pack counts before calling Supabase', () => {
    assert.throws(() => parsePackCount('0'), /positive number/);
    assert.throws(() => parsePackCount('not-a-number'), /positive number/);
});

test('sends a normalized atomic receiving request', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const supabase: StockReceivingClient = {
        rpc: async (functionName, args) => {
            calls.push({ functionName, args });
            return {
                data: {
                    ingredient_id: 7,
                    ingredient_name: 'Espresso Beans',
                    pack_count: 2,
                    pack_size_oz: 80,
                    stock_added_oz: 160,
                    stock_after_oz: 240
                },
                error: null
            };
        }
    };

    const receipt = await receiveStockDelivery(
        supabase,
        ' BEAN-001 ',
        2,
        ' Sean '
    );

    assert.equal(receipt.stock_added_oz, 160);
    assert.deepEqual(calls, [{
        functionName: 'receive_stock_delivery',
        args: {
            p_gfs_code: 'BEAN-001',
            p_pack_count: 2,
            p_received_by: 'Sean'
        }
    }]);
});
