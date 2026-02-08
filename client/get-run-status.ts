import { RunStatus } from '../core';
import { RunEntry } from '../core/internal/run-registry';
import { RuntimeContext } from '../core/internal/runtime-context';
import { getRunStatus as getRunStatusFromDb } from '../core/internal/repository/get-run-status';

export async function getRunStatus(ctx: RuntimeContext, runId: string): Promise<RunStatus> {
  const { db, runRegistry } = ctx;
  const run = runRegistry.getRun(runId);
  if (run) {
    return getRunStatusFromRegistry(run);
  }
  return getRunStatusFromDb(db, runId);
}

async function getRunStatusFromRegistry(runEntry: RunEntry): Promise<RunStatus> {
  if (runEntry.store.abortSignal.aborted) {
    return 'cancelled';
  }
  const promiseState = runEntry.getPromiseState();
  if (promiseState === 'pending') {
    return 'pending';
  }
  if (promiseState === 'fulfilled') {
    return 'success';
  }
  return 'error';
}
