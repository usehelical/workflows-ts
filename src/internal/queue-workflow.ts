import { RuntimeContext } from './context/runtime-context';
import { deserialize, deserializeError, serialize } from './utils/serialization';

import crypto from 'node:crypto';
import { createRunHandle } from './run';
import { enqueueRun } from './db/commands/enqueue-run';
import { ClientContext } from './context/client-context';
import { withDbRetry } from './db/retry';
import { ExecutionContext } from './context/execution-context';
import { executeAndRecordOperation } from './context/operation-manager';

export type QueueWorkflowOptions = {
  timeout?: number;
  deadline?: number;
  priority?: number;
  partitionKey?: string;
  id?: string;
  deduplicationId?: string;
};

export async function queueWorkflow<TArgs extends unknown[], TReturn>(
  ctx: RuntimeContext | ClientContext | ExecutionContext,
  queueName: string,
  workflowName: string,
  args?: TArgs,
  options?: QueueWorkflowOptions,
) {
  const { db } = ctx;
  const newRunId = options?.id ?? crypto.randomUUID();

  if (ctx.type === 'execution') {
    const { operationManager, runPath } = ctx;
    const op = operationManager.getOperationResult();
    if (op) {
      if (op.error) {
        throw deserializeError(op.error);
      }
      const newRunId = deserialize<string>(op.result!);
      return createRunHandle<TReturn>(ctx, newRunId);
    }

    await executeAndRecordOperation(operationManager, 'queueWorkflow', async () => {
      const { runId } = await enqueueRun(db, {
        runId: newRunId,
        path: [...runPath, newRunId],
        inputs: serialize(args),
        workflowName,
        queueName,
        timeout: options?.timeout,
        deadline: options?.deadline,
      });
      return runId;
    });

    return createRunHandle<TReturn>(ctx, newRunId);
  }

  await withDbRetry(
    async () =>
      await enqueueRun(db, {
        runId: newRunId,
        path: [newRunId],
        inputs: serialize(args),
        workflowName: workflowName,
        queueName: queueName,
        timeout: options?.timeout,
        deadline: options?.deadline,
      }),
  );

  return createRunHandle<TReturn>(ctx, newRunId);
}
