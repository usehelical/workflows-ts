import crypto from 'node:crypto';
import { getExecutionContext } from '@internal/context/execution-context';
import { executeAndRecordOperation } from '@internal/context/operation-manager';

export async function randomUUID() {
  const { operationManager } = getExecutionContext();
  const existingResult = operationManager.getOperationResult();
  if (existingResult) {
    return existingResult.result as string;
  } else {
    return await executeAndRecordOperation(operationManager, 'randomUUID', async () => {
      return crypto.randomUUID();
    });
  }
}
