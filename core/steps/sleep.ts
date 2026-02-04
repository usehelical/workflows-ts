import { RunCancelledError } from '../internal/errors';
import { getExecutionContext } from '../internal/execution-context';
import { executeAndRecordOperation } from '../internal/operation-manager';

const SLEEP_OPERATION_NAME = '_helical::sleep';

export async function sleep(ms: number) {
  const { operationManager, abortSignal } = getExecutionContext();
  let endTimeMs: number;
  const existingResult = operationManager.getOperationResult();
  if (existingResult) {
    endTimeMs = Number(existingResult.result);
  } else {
    const currentTime = Date.now();
    endTimeMs = currentTime + ms;
    await executeAndRecordOperation(operationManager, SLEEP_OPERATION_NAME, async () => {
      return endTimeMs;
    });
  }
  const remainingMs = endTimeMs - Date.now();
  try {
    await cancellableSleep(remainingMs, abortSignal);
  } catch {
    throw new RunCancelledError();
  }
}

export function cancellableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Sleep aborted'));
      return;
    }

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new Error('Sleep aborted'));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort);
  });
}
