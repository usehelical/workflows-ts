import { sql } from 'kysely';
import { Database } from '../db';
import { MessageRetrievalRequest } from '../../events/message-event-bus';

export async function getMessageBatch(
  db: Database,
  messageRetrievalRequests: MessageRetrievalRequest,
) {
  const uniquePairs = Array.from(
    new Map(
      messageRetrievalRequests.map((r) => [`${r.destinationWorkflowId}:${r.messageType}`, r]),
    ).values(),
  );

  const results = await db
    .selectFrom('messages')
    .select(['id', 'payload', 'type', 'destination_run_id'])
    .where(
      sql<boolean>`(destination_run_id, type) IN (${sql.join(
        uniquePairs.map((r) => sql`(${r.destinationWorkflowId}, ${r.messageType})`),
      )})`,
    )
    .execute();

  return results.map((r) => ({
    id: r.id,
    payload: r.payload,
    type: r.type,
    destinationRunId: r.destination_run_id,
  }));
}
