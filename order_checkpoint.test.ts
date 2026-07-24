import assert from 'node:assert/strict';
import test from 'node:test';
import {
    advanceSquareOrderCheckpoint,
    CheckpointSupabaseClient,
    getSquareOrderBeginTime
} from './order_checkpoint';

test('uses a 24-hour lookback when no checkpoint exists', async () => {
    const supabase: CheckpointSupabaseClient = {
        rpc: async () => ({ data: null, error: null })
    };

    const beginTime = await getSquareOrderBeginTime(
        supabase,
        '2026-07-25T12:00:00.000Z'
    );

    assert.equal(beginTime, '2026-07-24T12:00:00.000Z');
});

test('uses the durable Supabase checkpoint when available', async () => {
    const supabase: CheckpointSupabaseClient = {
        rpc: async () => ({
            data: '2026-07-25T10:30:00.000Z',
            error: null
        })
    };

    const beginTime = await getSquareOrderBeginTime(
        supabase,
        '2026-07-25T12:00:00.000Z'
    );

    assert.equal(beginTime, '2026-07-25T10:30:00.000Z');
});

test('advances the named checkpoint only after a successful run', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const supabase: CheckpointSupabaseClient = {
        rpc: async (functionName, args) => {
            calls.push({ functionName, args });
            return { data: '2026-07-25T12:00:00.000Z', error: null };
        }
    };

    await advanceSquareOrderCheckpoint(
        supabase,
        '2026-07-25T12:00:00.000Z'
    );

    assert.deepEqual(calls, [{
        functionName: 'advance_integration_checkpoint',
        args: {
            p_name: 'square-completed-orders',
            p_checkpoint_at: '2026-07-25T12:00:00.000Z'
        }
    }]);
});
