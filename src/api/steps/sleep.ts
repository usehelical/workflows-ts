import { RunCancelledError } from '@internal/errors';
import { getExecutionContext } from '@internal/context/execution-context';
import { withDurableDeadline } from '@internal/with-durable-deadline';

const SLEEP_OPERATION_NAME = '_helical::sleep';

export async function sleep(ms: number) {
  const { abortSignal } = getExecutionContext();
  return await withDurableDeadline(ms, SLEEP_OPERATION_NAME, async (deadlineMs) => {
    const remainingMs = deadlineMs! - Date.now();
    try {
      await cancellableSleep(remainingMs, abortSignal);
    } catch {
      throw new RunCancelledError();
    }
  });
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
