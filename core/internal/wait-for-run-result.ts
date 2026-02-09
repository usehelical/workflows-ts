import {
  MaxRecoveryAttemptsExceededError,
  RunCancelledError,
  RunNotFoundError,
  UnknownError,
} from './errors';
import { getRun } from './repository/get-run';
import { RuntimeContext } from './context/runtime-context';
import { deserialize, deserializeError } from './utils/serialization';
import { RunResult } from '../../client/run';
import { TERMINAL_STATES } from '../workflow';

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

  switch (run.status) {
    case 'success':
      return {
        data: run.output ? (deserialize(run.output) as TReturn) : (undefined as TReturn),
        success: true,
      };
    case 'error':
      return {
        error: run.error ? (deserializeError(run.error) as unknown as Error) : new UnknownError(),
        success: false,
      };
    case 'cancelled':
      return {
        error: new RunCancelledError(),
        success: false,
      };
    case 'max_recovery_attempts_exceeded':
      return {
        error: run.error
          ? (deserializeError(run.error) as unknown as Error)
          : new MaxRecoveryAttemptsExceededError(),
        success: false,
      };
  }

  return new Promise<RunResult<TReturn>>((resolve, reject) => {
    const unsubscribe = runEventBus.subscribe(runId, '*', async (e) => {
      if (TERMINAL_STATES.includes(e.status)) {
        unsubscribe();
        try {
          const run = await getRun(db, runId);
          if (!run) {
            reject(new RunNotFoundError(runId));
            return;
          }
          switch (run.status) {
            case 'success':
              resolve({
                data: run.output ? (deserialize(run.output) as TReturn) : (undefined as TReturn),
                success: true,
              });
              return;
            case 'error':
              resolve({
                error: run.error
                  ? (deserializeError(run.error) as unknown as Error)
                  : new UnknownError(),
                success: false,
              });
              return;
            case 'cancelled':
              resolve({
                error: new RunCancelledError(),
                success: false,
              });
              return;
            case 'max_recovery_attempts_exceeded':
              resolve({
                error: run.error
                  ? (deserializeError(run.error) as unknown as Error)
                  : new MaxRecoveryAttemptsExceededError(),
                success: false,
              });
              return;
          }
        } catch (error) {
          if (error instanceof RunNotFoundError) {
            reject(error);
            return;
          }
          resolve({
            error: error as Error,
            success: false,
          });
        }
      }
    });
  });
}
