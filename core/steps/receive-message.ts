import { withDbRetry } from '../internal/db/retry';
import { MessageEventBus } from '../internal/events/message-event-bus';
import { getExecutionContext } from '../internal/execution-context';
import { returnOrThrowOperationResult } from '../internal/operation-manager';
import { readAndDeleteMessage } from '../internal/repository/read-and-delete-message';
import { deserialize, serialize, serializeError } from '../internal/serialization';
import { MessageDefinition } from '../message';

const RECEIVE_MESSAGE_OPERATION_NAME = 'workflow::message::receive';

class MessageNotAvailableError extends Error {}

export async function receiveMessage<T>(message: MessageDefinition<T> | string): Promise<T> {
  const { runId, operationManager, messageEventBus, db } = getExecutionContext();
  const messageType = typeof message === 'string' ? message : message.name;

  const op = operationManager.getOperationResult();
  if (op) {
    return returnOrThrowOperationResult<T>(op) as T;
  }

  const seqId = operationManager.reserveSequenceId();

  while (true) {
    try {
      return await withDbRetry(async () => {
        return await db.transaction().execute(async (tx) => {
          const msg = await readAndDeleteMessage(tx, runId, messageType);
          if (!msg) {
            throw new MessageNotAvailableError();
          }
          await operationManager.recordResult(
            RECEIVE_MESSAGE_OPERATION_NAME,
            seqId,
            serialize(msg.payload),
            tx,
          );
          return deserialize(msg.payload!) as T;
        });
      });
    } catch (error) {
      if (error instanceof MessageNotAvailableError) {
        await waitForMessageNotification(messageEventBus, runId, messageType);
        continue;
      }
      await operationManager.recordError(
        RECEIVE_MESSAGE_OPERATION_NAME,
        seqId,
        serializeError(error as Error),
      );
      throw error;
    }
  }
}

async function waitForMessageNotification(
  messageEventBus: MessageEventBus,
  runId: string,
  messageType: string,
): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = messageEventBus.subscribe(runId, messageType, () => {
      unsubscribe();
      resolve();
    });
  });
}
