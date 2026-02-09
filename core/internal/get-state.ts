import { withDbRetry } from './db/retry';
import { RuntimeContext } from './context/runtime-context';
import { StateDefinition } from '../state';
import { getState as getStateRepository } from './repository/get-state';
import { Run } from '../../client/run';
import { deserialize } from './utils/serialization';
import { StateEventBus } from './events/state-event-bus';

export class StateNotAvailableError extends Error {}

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
