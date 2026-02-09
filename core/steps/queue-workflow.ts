import { QueueNotFoundError, WorkflowNotFoundError } from '../../client/errors';
import { QueueWorkflowOptions } from '../internal/queue-workflow';
import { createRunHandle } from '../../client/run';
import { getExecutionContext } from '../internal/context/execution-context';
import { executeAndRecordOperation } from '../internal/context/operation-manager';
import { enqueueRun } from '../internal/repository/enqueue-run';
import { deserialize, deserializeError, serialize } from '../internal/utils/serialization';
import { QueueEntry } from '../queue';
import { WorkflowEntry } from '../workflow';

export async function queueWorkflow<TArgs extends unknown[], TReturn>(
  queue: QueueEntry | string,
  wf: WorkflowEntry<TArgs, TReturn> | string,
  args?: TArgs,
  options?: QueueWorkflowOptions,
) {
  const ctx = getExecutionContext();
  const { db, operationManager, queueRegistry, workflowRegistry, runPath, executorId } = ctx;

  const workflowName =
    typeof wf === 'string' ? wf : workflowRegistry.getByWorkflowDefinition(wf)?.name;
  if (!workflowName) {
    throw new WorkflowNotFoundError('Workflow name not specified');
  }

  const queueName = typeof queue === 'string' ? queue : queueRegistry.getByQueueEntry(queue)?.name;
  if (!queueName) {
    throw new QueueNotFoundError('Queue name not specified');
  }

  const op = operationManager.getOperationResult();
  if (op) {
    if (op.error) {
      throw deserializeError(op.error);
    }
    const newRunId = deserialize<string>(op.result!);
    return createRunHandle<TReturn>(ctx, newRunId);
  }

  const newRunId = await executeAndRecordOperation(operationManager, 'queueWorkflow', async () => {
    const newRunId = options?.id ?? crypto.randomUUID();
    const { runId } = await enqueueRun(db, {
      runId: newRunId,
      path: [...runPath, newRunId],
      inputs: serialize(args),
      executorId: executorId,
      workflowName: workflowName,
      queueName: queueName,
      timeout: options?.timeout,
      deadline: options?.deadline,
    });
    return runId;
  });

  return createRunHandle<TReturn>(ctx, newRunId!);
}
