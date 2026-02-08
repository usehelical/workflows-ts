import { Run } from '../../client/run';
import { getExecutionContext } from '../internal/execution-context';
import { returnOrThrowOperationResult } from '../internal/operation-manager';
import { serialize } from '../internal/serialization';
import { MessageDefinition } from '../message';
import { withDbRetry } from '../internal/db/retry';
import { insertMessage } from '../internal/repository/insert-message';

const SEND_MESSAGE_OPERATION_NAME = 'workflow::message::send';

export async function sendMessage<T>(target: Run | string, name: MessageDefinition<T>, data?: T) {
  const { operationManager, db } = getExecutionContext();

  const destinationWorkflowId = typeof target === 'string' ? target : target.id;
  const messageType = typeof name === 'string' ? name : name.name;

  const prevOp = operationManager.getOperationResult();
  if (prevOp) {
    return returnOrThrowOperationResult(prevOp);
  }

  const seqId = operationManager.reserveSequenceId();

  const serializedData = serialize(data);

  await withDbRetry(async () => {
    return await db.transaction().execute(async (tx) => {
      await insertMessage(tx, { destinationWorkflowId, messageType, data: serializedData });
      await operationManager.recordResult(SEND_MESSAGE_OPERATION_NAME, seqId, null, tx);
    });
  });
}
