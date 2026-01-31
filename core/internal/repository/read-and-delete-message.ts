import { Transaction } from '../db/db';

type Message = {
    id: string;
    payload?: string;
    type?: string;
}

export async function readAndDeleteMessage(tx: Transaction, runId: string, messageType?: string): Promise<Message | undefined> {
    const result = await tx.deleteFrom('messages')
        .where('destination_run_id', '=', runId)
        .$if(messageType !== undefined, (qb) => qb.where('type', '=', messageType!))
        .orderBy('created_at_epoch_ms', 'asc')
        .limit(1)
        .returning(['id', 'payload', 'type'])
        .executeTakeFirst();
    return result ? {
        id: result.id,
        payload: result.payload ?? undefined,
        type: result.type ?? undefined,
    } : undefined;
}
