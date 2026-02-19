import { MessageEventBus } from '../events/message-event-bus';
import { OperationManager, OperationResult } from './operation-manager';
import { StateEventBus } from '../events/state-event-bus';
import { RunOutsideOfWorkflowError } from '../errors';
import { Database } from '../db/db';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RunEventBus } from '../events/run-event-bus';
import { RunRegistry } from './run-registry';
import { QueueDefinition } from '@api/queue';
import { WorkflowDefinition } from '@api/workflow';
import { RuntimeContext } from './runtime-context';

export interface ExecutionContext {
  type: 'execution';
  runId: string;
  runPath: string[];
  executorId: string;
  abortSignal: AbortSignal;
  parentWorkflow?: ExecutionContext;
  operationManager: OperationManager;
  messageEventBus: MessageEventBus;
  stateEventBus: StateEventBus;
  runEventBus: RunEventBus;
  runRegistry: RunRegistry;
  queueRegistry: QueueDefinition[];
  workflowsMap: Record<string, WorkflowDefinition<unknown[], unknown>>;
  db: Database;
}

export function getExecutionContext(): ExecutionContext {
  const store = asyncLocalStorage.getStore();
  if (!store) {
    throw new RunOutsideOfWorkflowError();
  }
  return store;
}

export const asyncLocalStorage = new AsyncLocalStorage<ExecutionContext>();

export function runWithExecutionContext<TReturn>(
  store: ExecutionContext,
  callback: () => Promise<TReturn>,
) {
  return asyncLocalStorage.run(store, callback);
}

type CreateExecutionContextParams = {
  ctx: RuntimeContext | ExecutionContext;
  abortSignal: AbortSignal;
  runId: string;
  runPath: string[];
  operations?: OperationResult[];
};

export function createExecutionContext({
  ctx,
  abortSignal,
  runId,
  runPath,
  operations,
}: CreateExecutionContextParams): ExecutionContext {
  return {
    type: 'execution',
    runId: runId,
    runPath: runPath,
    executorId: ctx.executorId,
    abortSignal: abortSignal,
    operationManager: new OperationManager(ctx.db, runId, operations || []),
    messageEventBus: ctx.messageEventBus,
    stateEventBus: ctx.stateEventBus,
    workflowsMap: ctx.workflowsMap,
    runEventBus: ctx.runEventBus,
    runRegistry: ctx.runRegistry,
    queueRegistry: ctx.queueRegistry,
    db: ctx.db,
  };
}
