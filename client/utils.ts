import { Database } from '../core/internal/db/db';
import { MessageEventBus } from '../core/internal/events/message-event-bus';
import { StateEventBus } from '../core/internal/events/state-event-bus';
import { OperationManager, OperationResult } from '../core/internal/operation-manager';
import { ExecutionContext } from '../core/internal/execution-context';

export type WorkflowStoreDependencies = {
  db: Database;
  abortSignal: AbortSignal;
  executorId: string;
  messageEventBus: MessageEventBus;
  stateEventBus: StateEventBus;
};

export function createWorkflowStore(
  runId: string,
  runPath: string[],
  dependencies: WorkflowStoreDependencies,
  operations: OperationResult[] = [],
): ExecutionContext {
  return {
    runId: runId,
    runPath: runPath,
    executorId: dependencies.executorId,
    abortSignal: dependencies.abortSignal,
    operationManager: new OperationManager(dependencies.db, runId, operations),
    messageEventBus: dependencies.messageEventBus,
    stateEventBus: dependencies.stateEventBus,
    db: dependencies.db,
  };
}
