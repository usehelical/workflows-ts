import { withDbRetry } from '../internal/db/retry';
import { getExecutionContext } from '../internal/execution-context';
import { returnOrThrowOperationResult } from '../internal/operation-manager';
import { insertState } from '../internal/repository/insert-state';
import { serialize } from '../internal/serialization';
import { StateDefinition } from '../state';

const SET_STATE_OPERATION_NAME = 'workflow::state::set';

export async function setState<T = unknown>(state: StateDefinition<T> | string, value: T) {
  const stateKey = typeof state === 'string' ? state : state.name;
  const { operationManager, runId, db } = getExecutionContext();

  const op = operationManager.getOperationResult();
  if (op) {
    return returnOrThrowOperationResult<void>(op);
  }

  const seqId = operationManager.reserveSequenceId();

  await withDbRetry(async () => {
    return await db.transaction().execute(async (tx) => {
      await insertState(tx, { runId, key: stateKey, value: serialize(value), sequenceId: seqId });
      await operationManager.recordResult(SET_STATE_OPERATION_NAME, seqId, null, tx);
    });
  });
}
