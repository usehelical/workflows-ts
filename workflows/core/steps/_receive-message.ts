import { withDBRetry } from '../core/internal/db/retry';
import { MessageNotAvailableError } from '../core/internal/errors';
import { MessageEventBus } from '../core/internal/events/message-event-bus';
import { returnOrThrowOperationResult } from '../core/internal/operation-manager';
import { deserialize, serializeError } from '../core/internal/serialization';
import { getWorkflowStore } from '../core/internal/store';
import { MessageDefinition } from '../core/message';

const RECEIVE_MESSAGE_OPERATION_NAME = 'workflow::message::receive';

export async function receiveMessage<T>(message: MessageDefinition<T> | string): Promise<T> {
  const { runId, operationManager, repository, messageEventBus, db } = getWorkflowStore();
  const messageType = typeof message === 'string' ? message : message.name;

  const prevOp = operationManager.getOperationResult();
  if (prevOp) {
    return returnOrThrowOperationResult(prevOp) as T;
  }

  const seqId = operationManager.reserveSequenceId();

  while (true) {
    try {
      return await withDBRetry(async () => {
        return await db.transaction().execute(async (tx) => {
          const msg = await repository.readAndDeleteMessage(tx, runId, messageType);
          if (!msg) {
            throw MessageNotAvailableError;
          }
          await operationManager.recordResult(RECEIVE_MESSAGE_OPERATION_NAME, seqId, msg.data, tx);
          return deserialize(msg.data) as T;
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
  workflowId: string,
  messageType: string,
): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = messageEventBus.subscribe(workflowId, messageType, () => {
      unsubscribe();
      resolve();
    });
  });
}
