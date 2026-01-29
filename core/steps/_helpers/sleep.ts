import { getWorkflowStore } from '../internal/store';
import { sleep as sleepUtil } from '../internal/utils';

const SLEEP_OPERATION_NAME = 'fida::helpers::sleep';

export async function sleep(ms: number) {
  const { operationManager } = getWorkflowStore();
  let endTimeMs: number;
  const existingResult = operationManager.getOperationResult<number>();
  if (existingResult) {
    endTimeMs = existingResult.outputs;
  } else {
    const currentTime = Date.now();
    endTimeMs = currentTime + ms;
    await operationManager.runOperationAndRecordResult(SLEEP_OPERATION_NAME, async () => {
      return endTimeMs;
    });
  }
  const remainingMs = endTimeMs - Date.now();
  await sleepUtil(remainingMs);
}
