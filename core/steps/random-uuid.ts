import { getExecutionContext } from '../internal/execution-context';
import crypto from 'node:crypto';
import { executeAndRecordOperation } from '../internal/operation-manager';

const RANDOM_UUID_OPERATION_NAME = '_helical::randomUUID';

export async function randomUUID() {
  const { operationManager } = getExecutionContext();
  const existingResult = operationManager.getOperationResult();
  if (existingResult) {
    return existingResult.result as string;
  } else {
    await executeAndRecordOperation(operationManager, RANDOM_UUID_OPERATION_NAME, async () => {
      return crypto.randomUUID();
    });
  }
}
