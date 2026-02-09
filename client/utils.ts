import { OperationManager, OperationResult } from '../core/internal/context/operation-manager';
import { ExecutionContext } from '../core/internal/context/execution-context';
import { RuntimeContext } from '../core/internal/context/runtime-context';

type CreateExecutionContextParams = {
  ctx: RuntimeContext;
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
    runId: runId,
    runPath: runPath,
    executorId: ctx.executorId,
    abortSignal: abortSignal,
    operationManager: new OperationManager(ctx.db, runId, operations || []),
    messageEventBus: ctx.messageEventBus,
    stateEventBus: ctx.stateEventBus,
    workflowRegistry: ctx.workflowRegistry,
    runEventBus: ctx.runEventBus,
    runRegistry: ctx.runRegistry,
    queueRegistry: ctx.queueRegistry,
    db: ctx.db,
  };
}
