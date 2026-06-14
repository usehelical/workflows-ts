import { sql } from 'kysely';
import { Database } from '../db';

/**
 * Extends lease_expires_at for all runs currently owned by this executor.
 * Called on each heartbeat tick to prevent the reaper from reclaiming active runs.
 */
export async function renewLeases(
  db: Database,
  executorId: string,
  runIds: string[],
  leaseExpiresAtMs: number,
): Promise<void> {
  if (runIds.length === 0) {
    return;
  }
  await db
    .updateTable('runs')
    .set({ lease_expires_at: sql`${leaseExpiresAtMs}::bigint` })
    .where('executor_id', '=', executorId)
    .where('id', 'in', runIds)
    .where('status', '=', 'pending')
    .execute();
}
