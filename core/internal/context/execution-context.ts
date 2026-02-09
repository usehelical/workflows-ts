import { MessageEventBus } from '../events/message-event-bus';
import { OperationManager } from './operation-manager';
import { StateEventBus } from '../events/state-event-bus';
import { RunOutsideOfWorkflowError } from '../errors';
import { Database } from '../db/db';
import { AsyncLocalStorage } from 'node:async_hooks';
import { WorkflowRegistry } from './workflow-registry';
import { RunEventBus } from '../events/run-event-bus';
import { RunRegistry } from './run-registry';
import { QueueRegistry } from './queue-registry';

export interface ExecutionContext {
  runId: string;
  runPath: string[];
  executorId: string;
  abortSignal: AbortSignal;
  parentWorkflow?: ExecutionContext;
  operationManager: OperationManager;
  messageEventBus: MessageEventBus;
  stateEventBus: StateEventBus;
  workflowRegistry: WorkflowRegistry;
  runEventBus: RunEventBus;
  runRegistry: RunRegistry;
  queueRegistry: QueueRegistry;
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
