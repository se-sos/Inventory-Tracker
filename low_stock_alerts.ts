export type LowStockAlert = {
    alert_id: string;
    ingredient_name: string;
    current_stock_oz: number;
    threshold_oz: number;
};

type RpcResult = {
    data: unknown;
    error: { message?: string } | null;
};

export type AlertSupabaseClient = {
    rpc(
        functionName: string,
        args?: Record<string, unknown>
    ): PromiseLike<RpcResult>;
};

export type AlertEmailConfig = {
    apiKey: string;
    from: string;
    to: string[];
};

export type AlertRunResult = {
    claimed: number;
    sent: boolean;
};

function isLowStockAlert(value: unknown): value is LowStockAlert {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const alert = value as Partial<LowStockAlert>;

    return (
        typeof alert.alert_id === 'string'
        && typeof alert.ingredient_name === 'string'
        && typeof alert.current_stock_oz === 'number'
        && typeof alert.threshold_oz === 'number'
    );
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function buildLowStockEmail(alerts: LowStockAlert[]): string {
    const rows = alerts.map(alert => `
        <tr>
            <td>${escapeHtml(alert.ingredient_name)}</td>
            <td>${alert.current_stock_oz} oz</td>
            <td>${alert.threshold_oz} oz</td>
        </tr>
    `).join('');

    return `
        <h1>Ghost Coffee low-stock alert</h1>
        <p>${alerts.length} ingredient(s) need attention.</p>
        <table cellpadding="8" cellspacing="0" border="1">
            <thead>
                <tr>
                    <th>Ingredient</th>
                    <th>Current stock</th>
                    <th>Alert threshold</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

async function completeAlerts(
    supabase: AlertSupabaseClient,
    alertIds: string[],
    status: 'sent' | 'failed',
    errorMessage?: string
) {
    const { error } = await supabase.rpc('complete_low_stock_alerts', {
        p_alert_ids: alertIds,
        p_status: status,
        p_error_message: errorMessage ?? null
    });

    if (error) {
        throw new Error(
            `Failed to mark low-stock alerts ${status}: ${error.message ?? 'unknown database error'}`
        );
    }
}

export async function runLowStockAlerts(
    supabase: AlertSupabaseClient,
    config: AlertEmailConfig,
    fetchImplementation: typeof fetch = fetch
): Promise<AlertRunResult> {
    const { data, error } = await supabase.rpc('claim_low_stock_alerts');

    if (error) {
        throw new Error(
            `Failed to claim low-stock alerts: ${error.message ?? 'unknown database error'}`
        );
    }

    if (!Array.isArray(data) || !data.every(isLowStockAlert)) {
        throw new Error('Supabase returned invalid low-stock alert data');
    }

    if (data.length === 0) {
        return { claimed: 0, sent: false };
    }

    const alertIds = data.map(alert => alert.alert_id);
    let response: Response;

    try {
        response = await fetchImplementation('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: config.from,
                to: config.to,
                subject: `Ghost Coffee: ${data.length} low-stock ingredient(s)`,
                html: buildLowStockEmail(data)
            })
        });
    } catch (error) {
        const message = error instanceof Error
            ? error.message
            : 'unknown network error';

        await completeAlerts(
            supabase,
            alertIds,
            'failed',
            `Resend request failed: ${message}`
        );
        throw new Error(`Could not reach Resend: ${message}`);
    }

    if (!response.ok) {
        const responseText = (await response.text()).slice(0, 500);
        await completeAlerts(
            supabase,
            alertIds,
            'failed',
            `Resend ${response.status}: ${responseText}`
        );
        throw new Error(
            `Resend rejected the low-stock email with status ${response.status}`
        );
    }

    await completeAlerts(supabase, alertIds, 'sent');

    return {
        claimed: data.length,
        sent: true
    };
}
