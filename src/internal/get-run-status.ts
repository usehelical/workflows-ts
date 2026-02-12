import { RunStatus } from '@api/workflow';
import { ClientContext } from './context/client-context';
import { RunEntry } from './context/run-registry';
import { RuntimeContext } from './context/runtime-context';
import { getRunStatus as getRunStatusQuery } from './db/queries/get-run-status';
import { ExecutionContext } from './context/execution-context';
import {
  executeAndRecordOperation,
  returnOrThrowOperationResult,
} from './context/operation-manager';

export async function getRunStatus(
  ctx: RuntimeContext | ClientContext | ExecutionContext,
  runId: string,
): Promise<RunStatus> {
  const { db } = ctx;
  if (ctx.type === 'runtime') {
    const { runRegistry } = ctx;
    const run = runRegistry.getRun(runId);
    if (run) {
      return deriveRunStatus(run);
    }
    return getRunStatusQuery(db, runId);
  }

  if (ctx.type === 'execution') {
    const { operationManager, runRegistry } = ctx;
    const op = operationManager.getOperationResult();
    if (op) {
      returnOrThrowOperationResult<RunStatus>(op);
    }
    const status = await executeAndRecordOperation(operationManager, 'getRunStatus', async () => {
      const run = runRegistry.getRun(runId);
      if (run) {
        return deriveRunStatus(run);
      }
      return await getRunStatusQuery(db, runId);
    });
    return status;
  }

  return await getRunStatusQuery(db, runId);
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
