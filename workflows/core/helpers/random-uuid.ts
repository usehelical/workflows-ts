import { getWorkflowStore } from '../internal/store';
import crypto from 'node:crypto';

const RANDOM_UUID_OPERATION_NAME = 'fida::helpers::randomUUID';

export async function randomUUID() {
  const { operationManager } = getWorkflowStore();
  const existingResult = operationManager.getOperationResult();
  if (existingResult) {
    return existingResult.outputs as string;
  } else {
    const uuid = crypto.randomUUID();
    await operationManager.runOperationAndRecordResult(RANDOM_UUID_OPERATION_NAME, async () => {
      return uuid;
    });
  }
}
