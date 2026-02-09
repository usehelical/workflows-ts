import { RuntimeContext } from './context/runtime-context';
import { serialize } from './utils/serialization';
import { MessageDefinition } from '../message';
import { Run } from '../../client/run';
import { insertMessage } from './repository/insert-message';

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
