import { AsyncLocalStorage } from 'node:async_hooks';

import { Kysely } from 'kysely';
import { MessageEventBus } from './events/message-event-bus';
import { OperationManager } from './operation-manager';
import { StateEventBus } from './events/state-event-bus';

export interface Step {
  name: string;
  sequenceId: number;
  currentAttempt: number;
  maxAttempts: number;
}

export interface WorkflowStore {
  db: Kysely<any>;
  isCancelled: boolean;
  executorId: string;
  parentCtx?: WorkflowStore;
  workflowId: string;
  currentStep?: Step;
  messageEventBus: MessageEventBus;
  stateEventBus: StateEventBus;
  operationManager: OperationManager;
}

export async function runWithStore<R>(
  ctx: WorkflowStore,
  storage: AsyncLocalStorage<WorkflowStore>,
  callback: () => Promise<R>,
): Promise<R> {
  return await storage.run(ctx, callback);
}

export function getWorkflowStore(): WorkflowStore {
  return null as unknown as WorkflowStore;
}
