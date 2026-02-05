import { withDbRetry } from '../internal/db/retry';
import { TimeoutError } from '../internal/errors';
import { MessageEventBus } from '../internal/events/message-event-bus';
import { getExecutionContext } from '../internal/execution-context';
import { returnOrThrowOperationResult } from '../internal/operation-manager';
import { readAndDeleteMessage } from '../internal/repository/read-and-delete-message';
import { deserialize, serialize, serializeError } from '../internal/serialization';
import { withDurableDeadline } from '../internal/with-durable-deadline';
import { MessageDefinition } from '../message';

const RECEIVE_MESSAGE_OPERATION_NAME = 'workflow::message::receive';

const RECEIVE_MESSAGE_DURABLE_DEADLINE_OPERATION_NAME =
  'workflow::message::receive::durable-deadline';

class MessageNotAvailableError extends Error {}

export type ReceiveMessageOptions = {
  timeout?: number;
};

export async function receiveMessage<T>(
  message: MessageDefinition<T> | string,
  options?: ReceiveMessageOptions,
): Promise<T> {
  const messageType = typeof message === 'string' ? message : message.name;
  return await withDurableDeadline(
    options?.timeout,
    RECEIVE_MESSAGE_DURABLE_DEADLINE_OPERATION_NAME,
    async (deadlineMs) => {
      return await receiveMessageWithDeadline(messageType, deadlineMs);
    },
  );
}

async function receiveMessageWithDeadline<T>(
  messageType: string,
  deadlineMs: number | undefined,
): Promise<T> {
  const { runId, operationManager, messageEventBus, db } = getExecutionContext();

  const op = operationManager.getOperationResult();
  if (op) {
    return returnOrThrowOperationResult<T>(op) as T;
  }

  const seqId = operationManager.reserveSequenceId();

  while (true) {
    // Check if timeout expired
    if (deadlineMs && Date.now() >= deadlineMs) {
      const error = new TimeoutError(`Timed out waiting for message "${messageType}"`);
      await operationManager.recordError(
        RECEIVE_MESSAGE_OPERATION_NAME,
        seqId,
        serializeError(error),
      );
      throw error;
    }

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
        const remainingMs = deadlineMs ? deadlineMs - Date.now() : undefined;
        await waitForMessageNotification(messageEventBus, runId, messageType, remainingMs);
        continue;
      }
      // Record and re-throw other errors
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
  timeoutMs?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | undefined;

    if (timeoutMs !== undefined) {
      if (timeoutMs <= 0) {
        reject(new TimeoutError('Timeout expired'));
        return;
      }

      timeoutId = setTimeout(() => {
        unsubscribe();
        reject(new TimeoutError('Timeout waiting for message notification'));
      }, timeoutMs);
    }

    const unsubscribe = messageEventBus.subscribe(runId, messageType, () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
      resolve();
    });
  });
}
