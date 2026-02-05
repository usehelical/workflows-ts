import { getExecutionContext } from './execution-context';
import { executeAndRecordOperation } from './operation-manager';

export async function withDurableDeadline<T>(
  timeoutMs: number | undefined,
  operationName: string,
  fn: (deadlineMs: number | undefined) => Promise<T>,
): Promise<T> {
  if (!timeoutMs) {
    return await fn(undefined);
  }

  const { operationManager } = getExecutionContext();

  let deadlineMs: number;
  const op = operationManager.getOperationResult();
  if (op) {
    deadlineMs = Number(op.result);
  } else {
    deadlineMs = Date.now() + timeoutMs;
    await executeAndRecordOperation(operationManager, operationName, async () => {
      return deadlineMs;
    });
  }

  return await fn(deadlineMs);
}
