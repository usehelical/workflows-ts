import { returnOrThrowOperationResult } from '../core/internal/operation-manager';
import { serialize } from '../core/internal/serialization';
import { getWorkflowStore } from '../core/internal/store';
import { StateDefinition } from '../core/state';

const SET_STATE_OPERATION_NAME = 'workflow::state::set';

export async function setStateOperation<T = unknown>(state: StateDefinition<T> | string, value: T) {
  const stateKey = typeof state === 'string' ? state : state.name;
  const { operationManager, runId, db, repository } = getWorkflowStore();

  const prevOp = operationManager.getOperationResult();
  if (prevOp) {
    return returnOrThrowOperationResult(prevOp);
  }

  const serializedValue = serialize(value);

  const seqId = operationManager.reserveSequenceId();

  return await db.transaction().execute(async (tx) => {
    await repository.insertState(tx, runId, stateKey, serializedValue);
    await operationManager.recordResult(SET_STATE_OPERATION_NAME, seqId, null, tx);
  });
}
