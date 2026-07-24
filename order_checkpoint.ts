const CHECKPOINT_NAME = 'square-completed-orders';
const DEFAULT_LOOKBACK_HOURS = 24;

type RpcResult = {
    data: unknown;
    error: { message?: string } | null;
};

export type CheckpointSupabaseClient = {
    rpc(
        functionName: string,
        args: Record<string, unknown>
    ): PromiseLike<RpcResult>;
};

export async function getSquareOrderBeginTime(
    supabase: CheckpointSupabaseClient,
    endTime: string
): Promise<string> {
    const parsedEndTime = new Date(endTime);

    if (Number.isNaN(parsedEndTime.getTime())) {
        throw new Error(`Invalid Square order window end time: ${endTime}`);
    }

    const { data, error } = await supabase.rpc(
        'get_integration_checkpoint',
        { p_name: CHECKPOINT_NAME }
    );

    if (error) {
        throw new Error(
            `Failed to read Square order checkpoint: ${error.message ?? 'unknown database error'}`
        );
    }

    if (data === null) {
        return new Date(
            parsedEndTime.getTime()
            - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000
        ).toISOString();
    }

    if (typeof data !== 'string') {
        throw new Error('Supabase returned an invalid Square order checkpoint');
    }

    const checkpoint = new Date(data);

    if (Number.isNaN(checkpoint.getTime())) {
        throw new Error('Supabase returned an invalid Square order checkpoint');
    }

    // Clock skew or a bad manual value must not create an invalid Square range.
    if (checkpoint >= parsedEndTime) {
        return new Date(parsedEndTime.getTime() - 60 * 1000).toISOString();
    }

    return checkpoint.toISOString();
}

export async function advanceSquareOrderCheckpoint(
    supabase: CheckpointSupabaseClient,
    endTime: string
): Promise<void> {
    const { error } = await supabase.rpc(
        'advance_integration_checkpoint',
        {
            p_name: CHECKPOINT_NAME,
            p_checkpoint_at: endTime
        }
    );

    if (error) {
        throw new Error(
            `Failed to advance Square order checkpoint: ${error.message ?? 'unknown database error'}`
        );
    }
}
