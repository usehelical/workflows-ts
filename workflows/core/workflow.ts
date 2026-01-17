import { getWorkflowStore } from './internal/store';
import { QueueDefinition } from './queue';
import { OperationManager } from './internal/operation-manager';
import { getWorkflowOperations, insertWorkflow } from './repository';

export enum WorkflowStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  CANCELLED = 'CANCELLED',
  MAX_RECOVERY_ATTEMPTS_EXCEEDED = 'MAX_RECOVERY_ATTEMPTS_EXCEEDED',
}

const START_WORKFLOW_OPERATION_NAME = 'fida::workflow::start';

export type WorkflowFunction<Args extends any[], R> = (...args: Args) => Promise<R> | R;

export type WorkflowDefinition<TArgs extends unknown[] = unknown[], TReturn = unknown> = {
  fn: WorkflowFunction<TArgs, TReturn>;
  args: TArgs;
  maxRecoveryAttempts?: number;
};

export function defineWorkflow<TArgs extends any[], TReturn>(
  fn: WorkflowFunction<TArgs, TReturn>,
  options: {
    maxRecoveryAttempts?: number;
  } = {},
): (...args: TArgs) => WorkflowDefinition<TArgs, TReturn> {
  return (...args: TArgs) => {
    return {
      fn: fn,
      args: args,
      maxRecoveryAttempts: options.maxRecoveryAttempts,
    };
  };
}

export type Workflow<TArgs extends unknown[] = unknown[], TReturn = unknown> = {
  id: string;
  input: TArgs;
  getResult: () => Promise<TReturn | null>;
  getError: () => Promise<string | null>;
  getStatus: () => AsyncIterableIterator<WorkflowStatus>;
  cancel: () => Promise<void>;
};

export async function startWorkflow<TArgs extends unknown[], TReturn>(
  wf: WorkflowDefinition<TArgs, TReturn>,
): Promise<Workflow<TArgs, TReturn>> {
  const { operationManager, executorId, workflowId, db } = getWorkflowStore();

  const args: TArgs = wf.args;
  const workflowName = wf.fn.name;

  let newWorkflowId: string | undefined;

  // isReplay?

  const previousOperation = operationManager.getOperationResult();
  if (previousOperation) {
    newWorkflowId = previousOperation.outputs as string;
    const operations = await getWorkflowOperations(db, newWorkflowId);
    const newOpManager = new OperationManager(db, newWorkflowId, operations);
    // create new workflow store and run the workflow
  } else {
    newWorkflowId = await operationManager.runOperationAndRecordResult(
      START_WORKFLOW_OPERATION_NAME,
      async (tx) => {
        return await insertWorkflow(tx, {
          inputs: args,
          executorId: executorId,
          name: workflowName,
          parentWorkflowId: workflowId,
          workflowId: newWorkflowId,
        });
      },
    );
  }

  return null as unknown as Workflow<TArgs, TReturn>;

  // query for operations for this workflowId

  // need to create new operation manager and new context for the new workflow here before executing the fn
}

export type QueuedWorkflow<TArgs extends unknown[] = unknown[], TReturn = unknown> = Workflow<
  TArgs,
  TReturn
> & {
  queue: string;
};

export async function queueWorkflow<TArgs extends any[], TReturn>(
  wf: WorkflowDefinition<TArgs, TReturn>,
  queue: QueueDefinition,
): Promise<AsyncIterableIterator<QueuedWorkflow<TArgs, TReturn>>> {
  return (async function* () {
    yield {
      id: 'mock-id',
      input: wf.args,
      result: null,
      error: null,
      status: WorkflowStatus.QUEUED,
      queue: queue.name,
    };
  })();
}

export async function getWorkflow<
  TWorkflow extends WorkflowDefinition<any, any> = WorkflowDefinition<unknown[], unknown>,
>(
  id: string,
): Promise<AsyncIterableIterator<Workflow<TWorkflow['args'], ReturnType<TWorkflow['fn']>>>> {
  return (async function* () {
    yield {
      id: 'mock-id',
      input: [],
      result: null,
      error: null,
      status: WorkflowStatus.PENDING,
    };
  })();
}

export async function cancelWorkflow() {}

export async function resumeWorkflow() {}
