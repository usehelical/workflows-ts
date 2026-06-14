import { sql } from 'kysely';
import { Database } from '../db';

export type ClaimedRun = {
  runId: string;
  path: string[];
  workflowName: string;
  inputs: string | null;
  appVersion: string;
  recoveryAttempts: number;
};

const MAX_RECOVERY_ATTEMPTS = 10;

/**
 * Atomically claims a batch of recoverable runs for this worker.
 *
 * A run is recoverable when:
 *   - status = 'pending'
 *   - app_version matches this worker
 *   - lease is absent or expired (owner is presumed dead)
 *   - recovery_attempts has not exceeded the maximum
 *
 * Uses FOR UPDATE SKIP LOCKED so concurrent workers on the same version
 * do not contend on the same rows.
 */
export async function claimRecoverableRuns(
  db: Database,
  appVersion: string,
  executorId: string,
  leaseExpiresAtMs: number,
  batchSize: number,
): Promise<ClaimedRun[]> {
  const nowMs = Date.now();

  const results = await db.transaction().execute(async (tx) => {
    const candidates = await sql<{ id: string }>`
      SELECT id FROM runs
      WHERE status = 'pending'
        AND app_version = ${appVersion}
        AND recovery_attempts <= ${MAX_RECOVERY_ATTEMPTS}
        AND (lease_expires_at IS NULL OR lease_expires_at < ${nowMs})
      ORDER BY created_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `.execute(tx);

    if (candidates.rows.length === 0) {
      return [];
    }

    const ids = candidates.rows.map((r) => r.id);

    return await tx
      .updateTable('runs')
      .set({
        executor_id: executorId,
        lease_expires_at: sql`${leaseExpiresAtMs}::bigint`,
        recovery_attempts: sql`recovery_attempts + 1`,
        updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
      })
      .where('id', 'in', ids)
      .returning(['id', 'path', 'workflow_name', 'inputs', 'app_version', 'recovery_attempts'])
      .execute();
  });

  return results.map((r) => ({
    runId: r.id,
    path: r.path,
    workflowName: r.workflow_name,
    inputs: r.inputs,
    appVersion: r.app_version!,
    recoveryAttempts: Number(r.recovery_attempts),
  }));
}

/**
 * Targeted single-run claim — used by an external coordinator that assigns
 * specific runs to specific workers. Shares the same safety predicate as the
 * batch claim, so a stale/duplicate assignment is rejected if the lease is
 * still held or the version doesn't match.
 *
 * Returns null if the run could not be claimed (already held, wrong version,
 * or already terminal).
 */
export async function claimRun(
  db: Database,
  runId: string,
  appVersion: string,
  executorId: string,
  leaseExpiresAtMs: number,
): Promise<ClaimedRun | null> {
  const nowMs = Date.now();

  const result = await db
    .updateTable('runs')
    .set({
      executor_id: executorId,
      lease_expires_at: sql`${leaseExpiresAtMs}::bigint`,
      recovery_attempts: sql`recovery_attempts + 1`,
      updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
    })
    .where('id', '=', runId)
    .where('status', '=', 'pending')
    .where('app_version', '=', appVersion)
    .where('recovery_attempts', '<=', String(MAX_RECOVERY_ATTEMPTS))
    .where((eb) =>
      eb.or([eb('lease_expires_at', 'is', null), eb('lease_expires_at', '<', nowMs.toString())]),
    )
    .returning(['id', 'path', 'workflow_name', 'inputs', 'app_version', 'recovery_attempts'])
    .executeTakeFirst();

  if (!result) {
    return null;
  }

  return {
    runId: result.id,
    path: result.path,
    workflowName: result.workflow_name,
    inputs: result.inputs,
    appVersion: result.app_version!,
    recoveryAttempts: Number(result.recovery_attempts),
  };
}
