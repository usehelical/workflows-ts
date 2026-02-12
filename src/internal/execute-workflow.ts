import { WorkflowFunction } from '@api/workflow';
import { OperationResult } from '@internal/context/operation-manager';
import { recordRunResult } from './db/commands/record-run-result';
import { serialize, serializeError } from './utils/serialization';
import { RunWorkflowOptions } from './run-workflow';
import { RunCancelledError, RunDeadlineExceededError, RunTimedOutError } from './errors';
import {
  createExecutionContext,
  ExecutionContext,
  getExecutionContext,
  runWithExecutionContext,
} from './context/execution-context';
import { RuntimeContext } from './context/runtime-context';

export type ExecuteWorkflowParams<TArgs extends unknown[] = unknown[], TReturn = unknown> = {
  runId: string;
  runPath: string[];
  workflowName: string;
  fn: WorkflowFunction<TArgs, TReturn>;
  args: TArgs;
  options?: RunWorkflowOptions;
  operations?: OperationResult[];
};

export async function executeWorkflow<TArgs extends unknown[], TReturn>(
  ctx: RuntimeContext | ExecutionContext,
  params: ExecuteWorkflowParams<TArgs, TReturn>,
): Promise<void> {
  const { db, runRegistry } = ctx;
  const { options, runId, runPath, fn, args, operations } = params;

  const abortController = new AbortController();
  const [deadline, deadlineReason] = getDeadlineAndReason({
    timeout: options?.timeout,
    deadline: options?.deadline,
  });

  const runStore = createExecutionContext({
    ctx,
    abortSignal: AbortSignal.any(
      [abortController.signal].concat(deadline ? [AbortSignal.timeout(deadline - Date.now())] : []),
    ),
    runId,
    runPath,
    operations,
  });

  const executionPromise = (async () => {
    try {
      const result = await runWithExecutionContext(runStore, async () => {
        return await runWithTimeout(async () => {
          return await fn(...args);
        }, deadlineReason);
      });
      await recordRunResult(db, runId, { result: result ? serialize(result) : undefined });
      return result;
    } catch (error) {
      if (error instanceof RunCancelledError) {
        // User already called cancelRun() - just record the error
        await recordRunResult(db, runId, { error: serializeError(error as Error) }, true);
      } else {
        await recordRunResult(db, runId, { error: serializeError(error as Error) });
      }
      throw error;
    } finally {
      runRegistry.unregisterRun(runId);
    }
  })();

  runRegistry.registerRun(runId, {
    store: runStore,
    promise: executionPromise,
    abortController: abortController,
  });
}

function getDeadlineAndReason({
  timeout,
  deadline,
}: {
  timeout?: number;
  deadline?: number;
}): [number | undefined, 'timeout' | 'deadline' | undefined] {
  const now = Date.now();
  const timeoutDeadline = timeout ? now + timeout : undefined;

  if (timeoutDeadline && deadline) {
    return [
      Math.min(timeoutDeadline, deadline),
      timeoutDeadline < deadline ? 'timeout' : 'deadline',
    ];
  } else if (timeoutDeadline) {
    return [timeoutDeadline, 'timeout'];
  } else if (deadline) {
    return [deadline, 'deadline'];
  }
  return [undefined, undefined];
}

export async function runWithTimeout<T>(
  fn: () => Promise<T>,
  deadlineReason?: 'timeout' | 'deadline',
): Promise<T> {
  const { abortSignal } = getExecutionContext();

  const abortPromise = new Promise<T>((_, reject) => {
    abortSignal.throwIfAborted();
    abortSignal.addEventListener(
      'abort',
      () => {
        if (abortSignal.reason?.name === 'TimeoutError') {
          reject(new RunTimedOutError());
          return;
        }
        reject(new RunCancelledError());
      },
      { once: true },
    );
  });

  const callPromise = fn();

  try {
    return await Promise.race([callPromise, abortPromise]);
  } catch (error) {
    if (error instanceof RunTimedOutError) {
      if (deadlineReason === 'timeout') {
        throw new RunTimedOutError();
      } else if (deadlineReason === 'deadline') {
        throw new RunDeadlineExceededError();
      }
      throw error;
    }
    await callPromise.catch(() => {});
    throw error;
  }
}
