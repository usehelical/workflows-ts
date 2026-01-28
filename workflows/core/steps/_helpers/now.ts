import { getExecutionContext } from '../../internal/execution-context';

const NOW_OPERATION_NAME = 'fida::helpers::now';

export async function now() {
  const { operationManager } = getExecutionContext();
  const existingResult = operationManager.getOperationResult();
  if (existingResult) {
    return existingResult.outputs as number;
  } else {
    const currentTime = Date.now();
    await operationManager.runOperationAndRecordResult(NOW_OPERATION_NAME, async () => {
      return currentTime;
    });
  }
}
