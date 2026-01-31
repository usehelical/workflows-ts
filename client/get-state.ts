import { withDbRetry } from '../core/internal/db/retry';
import { RuntimeContext } from '../core/internal/runtime-context';
import { StateDefinition } from '../core/state';
import { getState as getStateRepository } from '../core/internal/repository/get-state';
import { Run } from './run';
import { deserialize } from '../core/internal/serialization';
import { StateEventBus } from '../core/internal/events/state-event-bus';

class StateNotAvailableError extends Error {}

export async function getState<T>(
  ctx: RuntimeContext,
  target: Run | string,
  key: StateDefinition<T> | string,
) {
  const { db, stateEventBus } = ctx;

  const destinationWorkflowId = typeof target === 'string' ? target : target.id;
  const stateKey = typeof key === 'string' ? key : key.name;

  while (true) {
    try {
      return await withDbRetry(async () => {
        const state = await getStateRepository(db, destinationWorkflowId, stateKey);
        if (!state) {
          throw new StateNotAvailableError();
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

async function waitForStateNotification(stateEventBus: StateEventBus, runId: string, key: string) {
  return new Promise((resolve) => {
    const unsubscribe = stateEventBus.subscribe(runId, key, (state) => {
      unsubscribe();
      resolve(state);
    });
  });
}
