import { getExecutionContext } from '../internal/execution-context';
import { executeAndRecordOperation } from '../internal/operation-manager';

export async function now() {
  const { operationManager } = getExecutionContext();
  const op = operationManager.getOperationResult();
  if (op) {
    return Number(op.result);
  } else {
    return await executeAndRecordOperation(operationManager, 'now', async () => {
      return Date.now();
    });
  }
}
