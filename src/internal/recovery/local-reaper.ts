import { sql } from 'kysely';
import { RecoveryCoordinator } from './coordinator';
import { RecoveryStore } from './recovery-store';
import { RuntimeContext } from '../context/runtime-context';
import { PollingLoop } from '../events/polling-loop';
import { getOperations } from '../db/queries/get-operations';
import { executeWorkflow } from '../execute-workflow';
import { deserialize } from '../utils/serialization';
import { serializeError } from '../utils/serialization';
import { MaxRecoveryAttemptsExceededError } from '../errors';
import { withDbRetry } from '../db/retry';

const HEARTBEAT_INTERVAL_MS = 10_000;
const LEASE_TTL_MS = 30_000;
const REAPER_INTERVAL_MS = 10_000;
const REAPER_BATCH_SIZE = 20;
/** Max concurrent reaper-started replays. Avoids thundering herd after outage. */
const MAX_CONCURRENT_RECOVERY = 5;
const MAX_RECOVERY_ATTEMPTS = 10;

/**
 * Default in-process recovery coordinator.
 *
 * Runs two loops:
 *   - Heartbeat: upserts the worker row + extends leases on active runs.
 *   - Reaper: atomically claims orphaned runs (expired lease, matching version)
 *     and resumes them via replay. This replaces the old recover-pending-runs
 *     startup-only scan and self-heals the random-executorId gap: the new
 *     process doesn't need its old identity — it just waits for leases to lapse.
 */
export class LocalReaper implements RecoveryCoordinator {
  private readonly store: RecoveryStore;
  private readonly heartbeatLoop: PollingLoop;
  private readonly reaperLoop: PollingLoop;
  private activeRecoveries = 0;

  constructor(private readonly ctx: RuntimeContext) {
    this.store = new RecoveryStore(ctx.db);
    this.heartbeatLoop = new PollingLoop(
      HEARTBEAT_INTERVAL_MS,
      this.handleHeartbeat.bind(this),
      0.05,
    );
    this.reaperLoop = new PollingLoop(REAPER_INTERVAL_MS, this.handleReap.bind(this), 0.05);
  }

  start(): void {
    this.heartbeatLoop.start();
    this.reaperLoop.start();
    // Run immediately on startup so recovery doesn't wait for the first interval.
    void this.handleHeartbeat();
    void this.handleReap();
  }

  stop(): void {
    this.heartbeatLoop.stop();
    this.reaperLoop.stop();
  }

  private async handleHeartbeat(): Promise<void> {
    const { executorId, appVersion, runRegistry } = this.ctx;
    try {
      await this.store.heartbeat(executorId, appVersion);
      const activeIds = runRegistry.getActiveRunIds();
      if (activeIds.length > 0) {
        await this.store.renewLeases(executorId, activeIds, LEASE_TTL_MS);
      }
    } catch (error) {
      console.error('LocalReaper: heartbeat error', error);
    }
  }

  private async handleReap(): Promise<void> {
    const { executorId, appVersion, workflowsMap, db } = this.ctx;

    const available = MAX_CONCURRENT_RECOVERY - this.activeRecoveries;
    if (available <= 0) return;

    let claimed;
    try {
      claimed = await this.store.claimRecoverableRuns(
        appVersion,
        executorId,
        LEASE_TTL_MS,
        Math.min(available, REAPER_BATCH_SIZE),
      );
    } catch (error) {
      console.error('LocalReaper: claim error', error);
      return;
    }

    for (const run of claimed) {
      // Check max recovery attempts — mark terminal if exceeded.
      if (run.recoveryAttempts > MAX_RECOVERY_ATTEMPTS) {
        const err = new MaxRecoveryAttemptsExceededError(run.runId, MAX_RECOVERY_ATTEMPTS);
        try {
          await withDbRetry(async () => {
            await db
              .updateTable('runs')
              .set({
                status: 'max_recovery_attempts_exceeded',
                error: serializeError(err),
                updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
              })
              .where('id', '=', run.runId)
              .where('status', '=', 'pending')
              .execute();
          });
        } catch (e) {
          console.error(`LocalReaper: failed to mark run ${run.runId} as exceeded`, e);
        }
        continue;
      }

      const workflow = workflowsMap[run.workflowName];
      if (!workflow) {
        console.error(`LocalReaper: workflow "${run.workflowName}" not registered — skipping run ${run.runId}`);
        continue;
      }

      let operations;
      try {
        operations = await getOperations(db, run.runId);
      } catch (error) {
        console.error(`LocalReaper: failed to load operations for run ${run.runId}`, error);
        continue;
      }

      this.activeRecoveries++;
      executeWorkflow(this.ctx, {
        runId: run.runId,
        runPath: run.path,
        workflowName: run.workflowName,
        fn: workflow.fn,
        args: run.inputs ? deserialize<unknown[]>(run.inputs) : [],
        operations,
      })
        .catch((error) => {
          console.error(`LocalReaper: error recovering run ${run.runId}`, error);
        })
        .finally(() => {
          this.activeRecoveries--;
        });
    }
  }
}
