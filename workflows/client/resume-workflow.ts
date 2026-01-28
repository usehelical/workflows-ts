import { RunNotCancellableError, RunNotFoundError } from '../core/internal/errors';
import { getRun } from '../core/internal/repository/get-run';
import { RuntimeContext } from '../core/internal/runtime-context';
import { WorkflowStatus } from '../core/workflow';

const INTERNAL_QUEUE_NAME = '_helical-internal-queue';

// TODO: Need to implement queues first (async dispatch)

export async function resumeWorkflow(ctx: RuntimeContext, runId: string) {
  const { db } = ctx;

  await db.transaction().execute(async (tx) => {
    const run = await getRun(tx, runId);
    if (!run) {
      throw new RunNotFoundError(runId);
    }

    if (run.status !== WorkflowStatus.PENDING) {
      throw new RunNotCancellableError(`Runs with status ${run.status} cannot be resumed`);
    }
  });
}
