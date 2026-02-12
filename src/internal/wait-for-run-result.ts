import {
  MaxRecoveryAttemptsExceededError,
  RunCancelledError,
  RunNotFoundError,
  UnknownError,
} from './errors';
import { getRun } from './db/queries/get-run';
import { RuntimeContext } from './context/runtime-context';
import { deserialize, deserializeError } from './utils/serialization';
import { RunResult } from './run';
import { TERMINAL_STATES } from '@api/workflow';
import { ClientContext } from './context/client-context';
import { ExecutionContext } from './context/execution-context';
import {
  executeAndRecordOperation,
  returnOrThrowOperationResult,
} from './context/operation-manager';

export async function waitForRunResult<TReturn>(
  ctx: RuntimeContext | ClientContext | ExecutionContext,
  runId: string,
): Promise<RunResult<TReturn>> {
  if (ctx.type === 'execution') {
    const { operationManager } = ctx;
    const op = operationManager.getOperationResult();
    if (op) {
      returnOrThrowOperationResult<RunResult<TReturn>>(op);
    }
    const result = await executeAndRecordOperation(
      operationManager,
      'waitForRunResult',
      async () => {
        return await getOrSubscribeToRunResult<TReturn>(ctx, runId);
      },
    );
    return result;
  }
  return await getOrSubscribeToRunResult<TReturn>(ctx, runId);
}

async function getOrSubscribeToRunResult<TReturn>(
  ctx: RuntimeContext | ClientContext | ExecutionContext,
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
          : new MaxRecoveryAttemptsExceededError(runId, run.recoveryAttempts),
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
                  : new MaxRecoveryAttemptsExceededError(runId, run.recoveryAttempts),
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
