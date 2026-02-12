import { RuntimeContext } from './context/runtime-context';
import { serialize } from './utils/serialization';
import { insertMessage } from './db/commands/insert-message';
import { ClientContext } from './context/client-context';
import { MessageDefinition } from '@api/message';
import { Run } from './run';
import { ExecutionContext } from './context/execution-context';
import {
  executeAndRecordOperation,
  returnOrThrowOperationResult,
} from './context/operation-manager';

export async function sendMessage(
  ctx: RuntimeContext | ClientContext | ExecutionContext,
  target: Run | string,
  name: MessageDefinition<unknown> | string,
  data?: unknown,
) {
  const { db } = ctx;
  const destinationWorkflowId = typeof target === 'string' ? target : target.id;
  const messageType = typeof name === 'string' ? name : name.name;
  const serializedData = serialize(data);

  if (ctx.type === 'execution') {
    const { operationManager } = ctx;
    const op = operationManager.getOperationResult();
    if (op) {
      return returnOrThrowOperationResult<void>(op);
    }
    await executeAndRecordOperation(operationManager, 'sendMessage', async () => {
      await insertMessage(db, {
        destinationWorkflowId,
        messageType,
        data: serializedData,
      });
    });
  } else {
    await insertMessage(db, {
      destinationWorkflowId,
      messageType,
      data: serializedData,
    });
  }
}
