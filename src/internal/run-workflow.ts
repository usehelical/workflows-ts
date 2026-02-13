import crypto from 'node:crypto';
import { deserialize, deserializeError, serialize } from './utils/serialization';
import { WorkflowFunction } from '@api/workflow';
import { executeWorkflow } from './execute-workflow';
import { RuntimeContext } from './context/runtime-context';
import { WorkflowNotFoundError } from '@internal/errors';
import { createRunHandle } from './run';
import { insertPendingRun } from './db/commands/insert-pending-run';
import { ExecutionContext } from './context/execution-context';
import { executeAndRecordOperation } from './context/operation-manager';
import { withDbRetry } from './db/retry';

export type RunWorkflowOptions = {
  timeout?: number;
  deadline?: number;
  id?: string;
};

type RunWorkflowOperationResult = {
  runId: string;
  runPath: string[];
  workflowName: string;
};

export async function runWorkflow<TArgs extends unknown[], TReturn>(
  ctx: RuntimeContext | ExecutionContext,
  workflowName: string,
  args: TArgs = [] as unknown as TArgs,
  options: RunWorkflowOptions = {},
) {
  const { db, executorId, workflowsMap, type } = ctx;

  const workflow = workflowsMap[workflowName];
  if (!workflow) {
    throw new WorkflowNotFoundError(workflowName);
  }

  const newRunId = options.id ?? crypto.randomUUID();
  let newRunPath: string[] = [];

  if (type === 'execution') {
    const { operationManager, runPath } = ctx;
    const op = operationManager.getOperationResult();
    if (op) {
      if (op.error) {
        throw deserializeError(op.error);
      }
      const newRun = deserialize<RunWorkflowOperationResult>(op.result!);
      return createRunHandle<TReturn>(ctx, newRun.runId);
    }

    const newRun = await executeAndRecordOperation(operationManager, 'runWorkflow', async () => {
      const newRun: RunWorkflowOperationResult = {
        runId: newRunId,
        runPath: [...runPath, newRunId],
        workflowName: workflowName,
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

    newRunPath = newRun.runPath;
  }

  if (type === 'runtime') {
    const { path } = await insertPendingRun(db, {
      runId: newRunId,
      path: [newRunId],
      inputs: serialize(args),
      executorId: executorId,
      workflowName: workflowName,
    });
    newRunPath = path;
  }

  await executeWorkflow<TArgs, TReturn>(ctx, {
    runId: newRunId,
    runPath: newRunPath,
    workflowName: workflowName,
    fn: workflow.fn as WorkflowFunction<TArgs, TReturn>,
    args,
    options,
  });

  return createRunHandle<TReturn>(ctx, newRunId);
}
