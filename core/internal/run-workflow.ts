import crypto from 'node:crypto';
import { serialize } from './utils/serialization';
import { WorkflowEntry, WorkflowFunction } from '../workflow';
import { executeWorkflow } from './execute-workflow';
import { RuntimeContext } from './context/runtime-context';
import { WorkflowNotFoundError } from '../../client/errors';
import { createRunHandle } from '../../client/run';
import { insertPendingRun } from './repository/insert-pending-run';

export type RunWorkflowOptions = {
  timeout?: number;
  deadline?: number;
  id?: string;
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

  const runId = options.id ?? crypto.randomUUID();

  const { path } = await insertPendingRun(db, {
    runId,
    path: [runId],
    inputs: serialize(args),
    executorId: executorId,
    workflowName: workflow.name,
  });

  await executeWorkflow<TArgs, TReturn>(ctx, {
    runId: runId,
    runPath: path,
    workflowName: workflow.name,
    fn: workflow.fn as WorkflowFunction<TArgs, TReturn>,
    args,
    options,
  });

  return createRunHandle<TReturn>(ctx, runId);
}
