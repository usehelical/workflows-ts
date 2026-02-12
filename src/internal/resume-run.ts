import { RuntimeContext } from './context/runtime-context';
import { resumeRun as resumeRunInDb } from './db/commands/resume-run';
import { ClientContext } from './context/client-context';
import { ExecutionContext } from './context/execution-context';
import {
  executeAndRecordOperation,
  returnOrThrowOperationResult,
} from './context/operation-manager';
import { withDbRetry } from './db/retry';

export async function resumeRun(
  ctx: RuntimeContext | ClientContext | ExecutionContext,
  runId: string,
) {
  const { db } = ctx;
  if (ctx.type === 'execution') {
    const { operationManager } = ctx;
    const op = operationManager.getOperationResult();
    if (op) {
      returnOrThrowOperationResult<void>(op);
    }
    await executeAndRecordOperation(operationManager, 'resumeRun', async () => {
      await withDbRetry(async () => await resumeRunInDb(db, runId));
    });
  } else {
    await withDbRetry(async () => await resumeRunInDb(db, runId));
  }
}
