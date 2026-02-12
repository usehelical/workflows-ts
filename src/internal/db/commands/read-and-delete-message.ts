import { sql } from 'kysely';
import { Transaction } from '../db';

type Message = {
  id: string;
  payload?: string;
  type?: string;
};

export async function readAndDeleteMessage(
  tx: Transaction,
  runId: string,
  messageType?: string,
): Promise<Message | undefined> {
  const results = await sql<Message>`
    DELETE FROM messages
    WHERE id IN (
      SELECT id FROM messages
      WHERE destination_run_id = ${runId}
      ${messageType !== undefined ? sql`AND type = ${messageType}` : sql``}
      ORDER BY created_at_epoch_ms ASC
      LIMIT 1
    )
    RETURNING id, payload, type
  `.execute(tx);

  const result = results.rows[0];

  return result
    ? {
        id: result.id,
        payload: result.payload ?? undefined,
        type: result.type ?? undefined,
      }
    : undefined;
}
