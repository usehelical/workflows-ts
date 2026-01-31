import { createWorkflowStore } from '../../client/utils';
import { WorkflowFunction } from '../workflow';
import { OperationResult } from './operation-manager';
import { recordRunResult } from './repository/record-run-result';
import { serialize, serializeError } from './serialization';
import { RunWorkflowOptions } from '../../client/run-workflow';
import { cancelRun } from './repository/cancel-run';
import { DeadlineError, RunCancelledError, TimeoutError } from './errors';
import { getExecutionContext, runWithExecutionContext } from './execution-context';
import { RuntimeContext } from './runtime-context';

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
  ctx: RuntimeContext,
  params: ExecuteWorkflowParams<TArgs, TReturn>,
): Promise<void> {
  const { db, runRegistry } = ctx;
  const { options, runId, runPath, fn, args, operations } = params;

  const abortController = new AbortController();
  const [deadline] = getDeadlineAndReason({
    timeout: options?.timeout,
    deadline: options?.deadline,
  });

  const runStore = createWorkflowStore(
    runId,
    runPath,
    {
      ...ctx,
      abortSignal: AbortSignal.any(
        [abortController.signal].concat(
          deadline ? [AbortSignal.timeout(deadline - Date.now())] : [],
        ),
      ),
    },
    operations,
  );

  const executionPromise = (async () => {
    try {
      const result = await runWithExecutionContext(runStore, async () => {
        return await runWithTimeout(async () => {
          return await fn(...args);
        });
      });
      await recordRunResult(db, runId, { result: result ? serialize(result) : undefined });
      return result;
    } catch (error) {
      await recordRunResult(db, runId, { error: serializeError(error as Error) });
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

export async function runWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
  const { runId, db, abortSignal } = getExecutionContext();

  const abortPromise = new Promise<T>((_, reject) => {
    abortSignal.throwIfAborted();
    abortSignal.addEventListener(
      'abort',
      () => {
        if (abortSignal.reason?.name === 'TimeoutError') {
          reject(new TimeoutError(`Workflow timed out`));
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
    if (error instanceof TimeoutError || error instanceof DeadlineError) {
      await cancelRun(runId, db);
    }
    await callPromise.catch(() => { });
    throw error;
  }
}
