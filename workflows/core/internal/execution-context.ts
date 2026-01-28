import { Kysely } from 'kysely';
import { MessageEventBus } from './events/message-event-bus';
import { OperationManager } from './operation-manager';
import { StateEventBus } from './events/state-event-bus';
import { asyncLocalStorage } from '../../client/runtime';
import { RunOutsideOfWorkflowError } from './errors';

export interface ExecutionContext {
  runId: string;
  runPath: string[];
  executorId: string;
  abortSignal: AbortSignal;
  parentWorkflow?: ExecutionContext;
  operationManager: OperationManager;
  messageEventBus: MessageEventBus;
  stateEventBus: StateEventBus;
  db: Kysely<any>;
}

export function getExecutionContext(): ExecutionContext {
  const store = asyncLocalStorage.getStore();
  if (!store) {
    throw new RunOutsideOfWorkflowError();
  }
  return store;
}
