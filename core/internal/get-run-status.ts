import { RunStatus } from '..';
import { RunEntry } from './context/run-registry';
import { RuntimeContext } from './context/runtime-context';
import { getRunStatus as getRunStatusQuery } from './db/queries/get-run-status';

export async function getRunStatus(ctx: RuntimeContext, runId: string): Promise<RunStatus> {
  const { db, runRegistry } = ctx;
  const run = runRegistry.getRun(runId);
  if (run) {
    return deriveRunStatus(run);
  }
  return getRunStatusQuery(db, runId);
}

async function deriveRunStatus(runEntry: RunEntry): Promise<RunStatus> {
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
