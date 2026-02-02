import { RuntimeContext } from '../core/internal/runtime-context';
import { serialize } from '../core/internal/serialization';
import { MessageDefinition } from '../core/message';
import { Run } from './run';
import { insertMessage } from '../core/internal/repository/insert-message';

export async function sendMessage(
  ctx: RuntimeContext,
  target: Run | string,
  name: MessageDefinition<unknown> | string,
  data?: unknown,
) {
  const { db } = ctx;

  const destinationWorkflowId = typeof target === 'string' ? target : target.id;
  const messageType = typeof name === 'string' ? name : name.name;
  const serializedData = serialize(data);

  await insertMessage(db, {
    destinationWorkflowId,
    messageType,
    data: serializedData,
  });
}
