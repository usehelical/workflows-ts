import { sql } from 'kysely';
import { Database, Transaction } from '../db/db';
import { RunNotFoundError } from '../errors';

const INTERNAL_QUEUE_NAME = '_helical_internal_queue';

export async function resumeRun(db: Database | Transaction, runId: string) {
  const result = await db
    .updateTable('runs')
    .set({
      status: 'queued',
      queue_name: INTERNAL_QUEUE_NAME,
      deadline_epoch_ms: null,
      timeout_ms: null,
      recovery_attempts: 0,
      started_at_epoch_ms: sql`(extract(epoch from now()) * 1000)::bigint`,
      updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
    })
    .where('id', '=', runId)
    .where('status', '=', 'pending')
    .execute();

  if (!result) {
    throw new RunNotFoundError(runId);
  }
}
