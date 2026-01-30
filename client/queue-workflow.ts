import { QueueNotFoundError, WorkflowNotFoundError } from '../core/internal/errors';
import { RuntimeContext } from '../core/internal/runtime-context';
import { serialize } from '../core/internal/serialization';
import { QueueEntry } from '../core/queue';
import { WorkflowEntry } from '../core/workflow';
import crypto from 'node:crypto';
import { createRunHandle } from './run';
import { enqueueRun } from '../core/internal/repository/enqueue-run';

export type QueueWorkflowOptions = {
  timeout?: number;
  deadline?: number;
  priority?: number;
  partitionKey?: string;
  deduplicationId?: string;
};

export async function queueWorkflow<TArgs extends unknown[], TReturn>(
  ctx: RuntimeContext,
  queue: QueueEntry | string,
  wf: WorkflowEntry<TArgs, TReturn> | string,
  args?: TArgs,
  options?: QueueWorkflowOptions,
) {
  const { db, executorId, workflowRegistry, queueRegistry } = ctx;

  const runId = crypto.randomUUID();

  const workflowName =
    typeof wf === 'string' ? wf : workflowRegistry.getByWorkflowDefinition(wf)?.name;
  if (!workflowName) {
    throw new WorkflowNotFoundError('Workflow name not specified');
  }

  const queueName = typeof queue === 'string' ? queue : queueRegistry.getByQueueEntry(queue)?.name;
  if (!queueName) {
    throw new QueueNotFoundError('Queue name not specified');
  }

  await enqueueRun(db, {
    runId,
    path: [runId],
    inputs: serialize(args),
    executorId,
    workflowName,
    timeout: options?.timeout,
    deadline: options?.deadline,
    queueName,
  });

  return createRunHandle<TReturn>(ctx, runId);
}
