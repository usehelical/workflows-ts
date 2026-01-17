import { getWorkflowStore } from './internal/store';
import { Workflow } from './workflow';
import { Transaction } from 'kysely';
import { subscriptionToAsyncIterator } from './internal/utils/subscription-iterator';

export type MessageDefinition<T> = {
  name: string;
  data?: T;
};

export function defineMessage<T>(name: string): MessageDefinition<T> {
  return { name } as MessageDefinition<T>;
}

const RECEIVE_MESSAGE_OPERATION_NAME = 'fida::receive-message';
const SEND_MESSAGE_OPERATION_NAME = 'fida::send-message';

// step implementation
export async function sendMessage<T>(
  target: Workflow | string,
  type: MessageDefinition<T> | string,
  data: T,
) {
  const { operationManager, messageEventBus } = getWorkflowStore();

  const destinationWorkflowId = typeof target === 'string' ? target : target.id;
  const messageType = typeof type === 'string' ? type : type.name;

  await operationManager.runOperationAndRecordResult(SEND_MESSAGE_OPERATION_NAME, async (tx) => {
    const [{ message_id: messageId }] = await tx
      .insertInto('messages')
      .values({
        destination_workflow_id: destinationWorkflowId,
        message_type: messageType,
        message_payload: JSON.stringify(data),
        created_at_epoch_ms: Date.now(),
      })
      .returning('message_id')
      .execute();
    messageEventBus.emitMessageEvent({
      messageId,
      destinationWorkflowId,
      type: messageType,
      payload: data,
    });
  });
}

// step implementation
export async function receiveMessage<T = unknown>(
  message?: MessageDefinition<T> | string,
): Promise<AsyncIterableIterator<T | null>> {
  const { workflowId, operationManager, messageEventBus } = getWorkflowStore();
  const messageType = typeof message === 'string' ? message : message?.name;

  return (async function* () {
    const result = operationManager.getOperationResult();
    if (result) {
      yield result.outputs as T;
    }

    const message = await operationManager.runOperationAndRecordResult(
      RECEIVE_MESSAGE_OPERATION_NAME,
      async (tx) => {
        return await readAndDeleteMessage(tx, workflowId, messageType);
      },
    );

    if (message) {
      yield JSON.parse(message.message_payload) as T;
    }

    yield* subscriptionToAsyncIterator<T>((callback) =>
      messageEventBus.subscribe(workflowId, messageType ?? null, (event) => {
        operationManager.runOperationAndRecordResult(RECEIVE_MESSAGE_OPERATION_NAME, async (tx) => {
          const msg = await readAndDeleteMessage(tx, workflowId, messageType);
          if (msg) {
            callback(JSON.parse(msg.message_payload));
          }
        });
      }),
    );
  })();
}

async function readAndDeleteMessage(
  tx: Transaction<any>,
  workflowId: string,
  messageType?: string,
) {
  return await tx
    .deleteFrom('messages')
    .where('destination_workflow_id', '=', workflowId)
    .where('message_type', '=', messageType)
    .returningAll()
    .limit(1)
    .executeTakeFirst();
}
