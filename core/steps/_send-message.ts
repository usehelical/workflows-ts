import { withDBRetry } from '../core/internal/db/retry';
import { returnOrThrowOperationResult } from '../core/internal/operation-manager';
import { serialize } from '../core/internal/serialization';
import { getWorkflowStore } from '../core/internal/store';
import { MessageDefinition } from '../core/message';
import { Run } from '../core/run';

const SEND_MESSAGE_OPERATION_NAME = 'workflow::message::send';

export async function sendMessage<T>(target: Run | string, name: MessageDefinition<T>, data: T) {
  const { operationManager, messageEventBus, repository, db } = getWorkflowStore();

  const destinationWorkflowId = typeof target === 'string' ? target : target.id;
  const messageType = typeof name === 'string' ? name : name.name;

  const prevOp = operationManager.getOperationResult();
  if (prevOp) {
    return returnOrThrowOperationResult(prevOp);
  }

  const seqId = operationManager.reserveSequenceId();

  const serializedData = serialize(data);

  await withDBRetry(async () => {
    return await db.transaction().execute(async (tx) => {
      await repository.insertMessage(tx, destinationWorkflowId, messageType, serializedData);
      await operationManager.recordResult(SEND_MESSAGE_OPERATION_NAME, seqId, null, tx);
    });
  });
  messageEventBus.emitEvent(destinationWorkflowId, messageType, 1);
}
