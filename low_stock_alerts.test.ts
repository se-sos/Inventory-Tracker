import assert from 'node:assert/strict';
import test from 'node:test';
import {
    AlertSupabaseClient,
    buildLowStockEmail,
    runLowStockAlerts
} from './low_stock_alerts';

test('escapes ingredient names in the email body', () => {
    const html = buildLowStockEmail([{
        alert_id: 'ALERT-1',
        ingredient_name: 'Beans <Dark & Bold>',
        current_stock_oz: 10,
        threshold_oz: 20
    }]);

    assert.match(html, /Beans &lt;Dark &amp; Bold&gt;/);
    assert.doesNotMatch(html, /Beans <Dark/);
});

test('does not send an email when no ingredients are newly low', async () => {
    const supabase: AlertSupabaseClient = {
        rpc: async () => ({ data: [], error: null })
    };
    let fetchCalled = false;

    const result = await runLowStockAlerts(
        supabase,
        {
            apiKey: 'test-key',
            from: 'alerts@example.com',
            to: ['owner@example.com']
        },
        async () => {
            fetchCalled = true;
            return new Response(null, { status: 200 });
        }
    );

    assert.deepEqual(result, { claimed: 0, sent: false });
    assert.equal(fetchCalled, false);
});

test('sends one digest and marks claimed alerts sent', async () => {
    const calls: Array<{
        functionName: string;
        args?: Record<string, unknown>;
    }> = [];
    const supabase: AlertSupabaseClient = {
        rpc: async (functionName, args) => {
            calls.push({ functionName, args });

            if (functionName === 'claim_low_stock_alerts') {
                return {
                    data: [{
                        alert_id: 'ALERT-1',
                        ingredient_name: 'Whole Milk',
                        current_stock_oz: 12,
                        threshold_oz: 24
                    }],
                    error: null
                };
            }

            return { data: 1, error: null };
        }
    };
    let emailBody = '';

    const result = await runLowStockAlerts(
        supabase,
        {
            apiKey: 'test-key',
            from: 'alerts@example.com',
            to: ['owner@example.com']
        },
        async (_url, init) => {
            emailBody = String(init?.body);
            return new Response('{}', { status: 200 });
        }
    );

    assert.deepEqual(result, { claimed: 1, sent: true });
    assert.match(emailBody, /Whole Milk/);
    assert.deepEqual(calls[1], {
        functionName: 'complete_low_stock_alerts',
        args: {
            p_alert_ids: ['ALERT-1'],
            p_status: 'sent',
            p_error_message: null
        }
    });
});

test('marks alerts failed when the email provider rejects the request', async () => {
    const calls: Array<{
        functionName: string;
        args?: Record<string, unknown>;
    }> = [];
    const supabase: AlertSupabaseClient = {
        rpc: async (functionName, args) => {
            calls.push({ functionName, args });

            if (functionName === 'claim_low_stock_alerts') {
                return {
                    data: [{
                        alert_id: 'ALERT-2',
                        ingredient_name: 'Espresso Beans',
                        current_stock_oz: 4,
                        threshold_oz: 16
                    }],
                    error: null
                };
            }

            return { data: 1, error: null };
        }
    };

    await assert.rejects(
        () => runLowStockAlerts(
            supabase,
            {
                apiKey: 'test-key',
                from: 'alerts@example.com',
                to: ['owner@example.com']
            },
            async () => new Response('unauthorized', { status: 401 })
        ),
        /status 401/
    );

    assert.equal(
        calls[1].functionName,
        'complete_low_stock_alerts'
    );
    assert.equal(calls[1].args?.p_status, 'failed');
});

test('rearms alerts after an email network failure', async () => {
    const calls: Array<{
        functionName: string;
        args?: Record<string, unknown>;
    }> = [];
    const supabase: AlertSupabaseClient = {
        rpc: async (functionName, args) => {
            calls.push({ functionName, args });

            if (functionName === 'claim_low_stock_alerts') {
                return {
                    data: [{
                        alert_id: 'ALERT-3',
                        ingredient_name: 'Vanilla Syrup',
                        current_stock_oz: 8,
                        threshold_oz: 12
                    }],
                    error: null
                };
            }

            return { data: 1, error: null };
        }
    };

    await assert.rejects(
        () => runLowStockAlerts(
            supabase,
            {
                apiKey: 'test-key',
                from: 'alerts@example.com',
                to: ['owner@example.com']
            },
            async () => {
                throw new Error('connection reset');
            }
        ),
        /Could not reach Resend/
    );

    assert.equal(calls[1].args?.p_status, 'failed');
    assert.match(
        String(calls[1].args?.p_error_message),
        /connection reset/
    );
});
