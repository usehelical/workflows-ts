import { QueueNotFoundError, WorkflowNotFoundError } from '../core/internal/errors';
import { upsertRun } from '../core/internal/repository/upsert-run';
import { RuntimeContext } from '../core/internal/runtime-context';
import { serialize } from '../core/internal/serialization';
import { QueueEntry } from '../core/queue';
import { WorkflowEntry, WorkflowStatus } from '../core/workflow';
import crypto from 'node:crypto';
import { createRunHandle } from './run';

export type QueueWorkflowOptions = {
  timeout?: number;
  deadline?: number;
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

  await upsertRun(db, {
    runId,
    path: [runId],
    inputs: serialize(args),
    executorId,
    workflowName,
    timeout: options?.timeout,
    deadline: options?.deadline,
    status: WorkflowStatus.QUEUED,
    queueName,
  });

  return createRunHandle<TReturn>(ctx, runId);
}
