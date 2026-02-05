import { Database } from '../db/db';

export async function clearQueueAssignment(db: Database, runId: string) {
  return await db
    .updateTable('runs')
    .set({
      queue_name: null,
      queue_partition_key: null,
      queue_deduplication_id: null,
      started_at_epoch_ms: undefined,
    })
    .where('id', '=', runId)
    .where('queue_name', 'is not', null)
    .where('status', '=', 'queued')
    .execute();
}
