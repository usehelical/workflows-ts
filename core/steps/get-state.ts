import { Run } from '../../client/run';
import { StateDefinition } from '../state';
import { getState as getStateFromDb } from '../internal/repository/get-state';
import { getExecutionContext } from '../internal/context/execution-context';
import { returnOrThrowOperationResult } from '../internal/context/operation-manager';
import { deserialize, serializeError } from '../internal/utils/serialization';
import { StateNotAvailableError, waitForStateNotification } from '../internal/get-state';
import { withDbRetry } from '../internal/db/retry';

export async function getState<T = unknown>(
  target: Run | string,
  key: StateDefinition<T> | string,
): Promise<T> {
  const { operationManager, db, stateEventBus } = getExecutionContext();

  const stateKey = typeof key === 'string' ? key : key.name;
  const targetId = typeof target === 'string' ? target : target.id;

  const op = operationManager.getOperationResult();
  if (op) {
    return returnOrThrowOperationResult<T>(op) as T;
  }

  const seqId = operationManager.reserveSequenceId();

  while (true) {
    try {
      return await withDbRetry(async () => {
        const state = await getStateFromDb(db, targetId, stateKey);
        if (!state) {
          throw new StateNotAvailableError();
        }
        await operationManager.recordResult('getState', seqId, state);
        return deserialize(state) as T;
      });
    } catch (error) {
      if (error instanceof StateNotAvailableError) {
        await waitForStateNotification(stateEventBus, targetId, stateKey);
        continue;
      }
      await operationManager.recordError('getState', seqId, serializeError(error as Error));
      throw error;
    }
  }
}
