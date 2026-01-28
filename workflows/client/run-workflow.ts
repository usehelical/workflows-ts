import crypto from 'node:crypto';
import { upsertRun } from '../core/internal/repository/upsert-run';
import { serialize } from '../core/internal/serialization';
import { WorkflowEntry, WorkflowFunction, WorkflowStatus } from '../core/workflow';
import { executeWorkflow } from '../core/internal/execute-workflow';
import { RuntimeContext } from '../core/internal/runtime-context';
import { WorkflowNotFoundError } from '../core/internal/errors';
import { createRunHandle } from './run';

export type RunWorkflowOptions = {
  timeout?: number;
  deadline?: number;
};

export async function runWorkflow<TArgs extends unknown[], TReturn>(
  ctx: RuntimeContext,
  wf: WorkflowEntry<TArgs, TReturn> | string,
  args: TArgs = [] as unknown as TArgs,
  options: RunWorkflowOptions = {},
) {
  const { db, executorId, workflowRegistry } = ctx;

  const workflow =
    typeof wf === 'string'
      ? workflowRegistry.getByName(wf)
      : workflowRegistry.getByWorkflowDefinition(wf);
  if (!workflow) {
    throw new WorkflowNotFoundError('Workflow not found');
  }

  const runId = crypto.randomUUID();

  const { runId: id, path } = await upsertRun(db, {
    runId,
    path: [runId],
    inputs: serialize(args),
    executorId: executorId,
    workflowName: workflow.name,
    status: WorkflowStatus.PENDING,
  });

  await executeWorkflow<TArgs, TReturn>(ctx, {
    runId: id,
    runPath: path,
    workflowName: workflow.name,
    fn: workflow.fn as WorkflowFunction<TArgs, TReturn>,
    args,
    options,
  });

  return createRunHandle<TReturn>(ctx, id);
}
