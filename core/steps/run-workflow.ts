import { createRunHandle } from '../../client/run';
import { RunWorkflowOptions } from '../../client/run-workflow';
import { withDbRetry } from '../internal/db/retry';
import { WorkflowNotFoundError } from '../internal/errors';
import { executeWorkflow } from '../internal/execute-workflow';
import { getExecutionContext } from '../internal/execution-context';
import { executeAndRecordOperation } from '../internal/operation-manager';
import { insertPendingRun } from '../internal/repository/insert-pending-run';
import { deserialize, deserializeError, serialize } from '../internal/serialization';
import { WorkflowEntry } from '../workflow';
import crypto from 'node:crypto';

type RunWorkflowOperationResult = {
  runId: string;
  runPath: string[];
  workflowName: string;
};

export async function runWorkflow<TArgs extends unknown[], TReturn>(
  wf: WorkflowEntry<TArgs, TReturn> | string,
  args: TArgs = [] as unknown as TArgs,
  options: RunWorkflowOptions = {},
) {
  const ctx = getExecutionContext();
  const { operationManager, runPath, workflowRegistry, db, executorId } = ctx;

  const workflow =
    typeof wf === 'string'
      ? workflowRegistry.getByName(wf)
      : workflowRegistry.getByWorkflowDefinition(wf);
  if (!workflow) {
    throw new WorkflowNotFoundError('Workflow not found');
  }

  const op = operationManager.getOperationResult();
  if (op) {
    if (op.error) {
      throw deserializeError(op.error);
    }
    const newRun = deserialize<RunWorkflowOperationResult>(op.result!);
    return createRunHandle<TReturn>(ctx, newRun.runId);
  }

  const newRun = await executeAndRecordOperation(operationManager, 'runWorkflow', async () => {
    const newRunId = crypto.randomUUID();
    const newRun: RunWorkflowOperationResult = {
      runId: newRunId,
      runPath: [...runPath, newRunId],
      workflowName: workflow.name,
    };
    withDbRetry(async () => {
      return await insertPendingRun(db, {
        ...newRun,
        path: newRun.runPath,
        inputs: serialize(args),
        executorId: executorId,
      });
    });
    return newRun;
  });

  await executeWorkflow(ctx, {
    runId: newRun.runId,
    runPath: newRun.runPath,
    workflowName: newRun.workflowName,
    fn: workflow.fn,
    args,
    options,
  });

  return createRunHandle<TReturn>(ctx, newRun.runId);
}
