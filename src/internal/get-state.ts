import { withDbRetry } from './db/retry';
import { RuntimeContext } from './context/runtime-context';
import { StateDefinition } from '@api/state';
import { getState as getStateRepository } from './db/queries/get-state';
import { deserialize } from './utils/serialization';
import { StateEventBus } from './events/state-event-bus';
import { ClientContext } from './context/client-context';
import { ExecutionContext } from './context/execution-context';
import {
  executeAndRecordOperation,
  returnOrThrowOperationResult,
} from './context/operation-manager';
import { Run } from './run';

class StateNotAvailableError extends Error {}

export async function getState<T>(
  ctx: RuntimeContext | ClientContext | ExecutionContext,
  target: Run | string,
  key: StateDefinition<T> | string,
) {
  const { db, stateEventBus } = ctx;

  const destinationWorkflowId = typeof target === 'string' ? target : target.id;
  const stateKey = typeof key === 'string' ? key : key.name;

  if (ctx.type === 'execution') {
    const { operationManager } = ctx;
    const op = operationManager.getOperationResult();
    if (op) {
      return returnOrThrowOperationResult<T>(op) as T;
    }
  }

  while (true) {
    try {
      return await withDbRetry(async () => {
        const state = await getStateRepository(db, destinationWorkflowId, stateKey);
        if (!state) {
          throw new StateNotAvailableError();
        }
        if (ctx.type === 'execution') {
          const { operationManager } = ctx;
          await executeAndRecordOperation(operationManager, 'getState', async () => {
            return state;
          });
        }
        return deserialize(state) as T;
      });
    } catch (error) {
      if (error instanceof StateNotAvailableError) {
        await waitForStateNotification(stateEventBus, destinationWorkflowId, stateKey);
        continue;
      }
      throw error;
    }
  }
}

export async function waitForStateNotification(
  stateEventBus: StateEventBus,
  runId: string,
  key: string,
) {
  return new Promise((resolve) => {
    const unsubscribe = stateEventBus.subscribe(runId, key, (state) => {
      unsubscribe();
      resolve(state);
    });
  });
}
