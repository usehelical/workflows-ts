import { RunCancelledError, RunNotFoundError } from '../core/internal/errors';
import { getRun } from '../core/internal/repository/get-run';
import { RuntimeContext } from '../core/internal/runtime-context';
import { deserialize, deserializeError } from '../core/internal/serialization';
import { RunResult } from './run';

export async function waitForRunResult<TReturn>(
  ctx: RuntimeContext,
  runId: string,
): Promise<RunResult<TReturn>> {
  const { db, runEventBus } = ctx;
  const run = await getRun(db, runId);
  if (!run) {
    return {
      error: new RunNotFoundError(runId),
      success: false,
    };
  }

  if (run.status === 'cancelled') {
    return {
      error: new RunCancelledError(),
      success: false,
    };
  }

  if (run.status === 'error') {
    return {
      error: run.error
        ? (deserializeError(run.error) as unknown as Error)
        : new Error('Unexptected error'),
      success: false,
    };
  }

  return new Promise<RunResult<TReturn>>((resolve, reject) => {
    const unsubscribe = runEventBus.subscribe(runId, '*', async (e) => {
      if (e.status === 'cancelled') {
        unsubscribe();
        resolve({
          error: new RunCancelledError(),
          success: false,
        });
        return;
      }
      if (e.status === 'success' || e.status === 'error') {
        unsubscribe();
        try {
          const completedRun = await getRun(db, runId);
          if (!completedRun) {
            reject(new RunNotFoundError(runId));
            return;
          }
          if (completedRun.status === 'error') {
            resolve({
              error: completedRun.error
                ? (deserializeError(completedRun.error) as unknown as Error)
                : new Error('error'),
              success: false,
            });
            return;
          }
          resolve({
            data: completedRun.output
              ? (deserialize(completedRun.output) as TReturn)
              : (undefined as TReturn),
            success: true,
          });
        } catch (error) {
          resolve({
            error: error as Error,
            success: false,
          });
        }
      }
    });
  });
}
