import { getExecutionContext } from '../internal/execution-context';
import crypto from 'node:crypto';
import { executeAndRecordOperation } from '../internal/operation-manager';

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
