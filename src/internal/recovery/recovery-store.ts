import { Database } from '../db/db';
import { upsertWorker } from '../db/commands/upsert-worker';
import { renewLeases } from '../db/commands/renew-leases';
import {
  ClaimedRun,
  claimRecoverableRuns,
  claimRun as claimRunCommand,
} from '../db/commands/claim-recoverable-runs';
import { listLiveVersions as listLiveVersionsQuery } from '../db/queries/list-live-versions';
import { withDbRetry } from '../db/retry';

export type { ClaimedRun };

/**
 * Postgres-backed primitives for worker liveness and run ownership.
 *
 * These methods are the invariant layer: they enforce version pinning and
 * lease-based ownership regardless of which policy driver (LocalReaper or an
 * external coordinator) calls them. The DB row-lock / predicate is always the
 * final authority — a duplicate or stale claim attempt from an external system
 * is safely rejected here.
 */
export class RecoveryStore {
  constructor(private readonly db: Database) {}

  /** Upsert the worker's heartbeat row. */
  async heartbeat(workerId: string, appVersion: string): Promise<void> {
    await withDbRetry(() => upsertWorker(this.db, workerId, appVersion));
  }

  /** Extend leases for all runs actively owned by this executor. */
  async renewLeases(executorId: string, runIds: string[], ttlMs: number): Promise<void> {
    if (runIds.length === 0) return;
    const expiresAtMs = Date.now() + ttlMs;
    await withDbRetry(() => renewLeases(this.db, executorId, runIds, expiresAtMs));
  }

  /**
   * Atomically claim a batch of orphaned runs whose lease has expired and
   * whose app_version matches this worker. Used by the in-process LocalReaper.
   */
  async claimRecoverableRuns(
    appVersion: string,
    executorId: string,
    ttlMs: number,
    batchSize: number,
  ): Promise<ClaimedRun[]> {
    const expiresAtMs = Date.now() + ttlMs;
    return await withDbRetry(() =>
      claimRecoverableRuns(this.db, appVersion, executorId, expiresAtMs, batchSize),
    );
  }

  /**
   * Targeted single-run claim. Used by an external coordinator that assigns
   * specific runs to specific workers. Returns null if the claim is rejected
   * (wrong version, lease still held, run not pending, max attempts exceeded).
   */
  async claimRun(
    runId: string,
    appVersion: string,
    executorId: string,
    ttlMs: number,
  ): Promise<ClaimedRun | null> {
    const expiresAtMs = Date.now() + ttlMs;
    return await withDbRetry(() =>
      claimRunCommand(this.db, runId, appVersion, executorId, expiresAtMs),
    );
  }

  /** Returns app_versions with a live heartbeat within the freshness window. */
  async listLiveVersions(freshnessMs: number): Promise<string[]> {
    return await withDbRetry(() => listLiveVersionsQuery(this.db, freshnessMs));
  }
}
