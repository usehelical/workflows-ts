import { cancelRun } from '../core/internal/repository/cancel-run';
import { DeadlineError, RunCancelledError, TimeoutError } from '../core/internal/errors';
import { recordRunResult } from '../core/internal/repository/record-run-result';
import { upsertRun } from '../core/internal/repository/upsert-run';
import { RunRegistry } from '../core/internal/run-registry';
import { serialize, serializeError } from '../core/internal/serialization';
import { getWorkflowStore } from '../core/internal/store';
import { WorkflowFunction, WorkflowStatus } from '../core/workflow';
import { runWithStore } from './runtime';
import { createWorkflowStore, WorkflowStoreDependencies } from './utils';
import crypto from 'node:crypto';

export type StartWorkflowOptions = {
  timeout?: number;
  deadline?: number;
};

export async function startWorkflowInternal(
  name: string,
  fn: WorkflowFunction<unknown[], unknown>,
  args: unknown[],
  runRegistry: RunRegistry,
  dependencies: WorkflowStoreDependencies,
  options: StartWorkflowOptions = {},
) {
  const { db } = dependencies;
  const runId = crypto.randomUUID();
  const idempotencyKey = crypto.randomUUID();

  const { runId: id, path } = await upsertRun(db, {
    runId,
    path: [runId],
    inputs: serialize(args),
    executorId: dependencies.executorId,
    workflowName: name,
    status: WorkflowStatus.PENDING,
    idempotencyKey,
  });

  const abortController = new AbortController();

  const [deadline] = getDeadlineAndReason({ timeout: options.timeout, deadline: options.deadline });
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'start-workflow.ts:44',
      message: 'Deadline calculation',
      data: {
        timeout: options.timeout,
        deadline: deadline,
        timeoutDuration: deadline ? deadline - Date.now() : null,
      },
      timestamp: Date.now(),
      sessionId: 'debug-session',
      hypothesisId: 'A',
    }),
  }).catch(() => {});
  // #endregion
  const runStore = createWorkflowStore(id, path, {
    ...dependencies,
    abortSignal: AbortSignal.any(
      [abortController.signal].concat(deadline ? [AbortSignal.timeout(deadline - Date.now())] : []),
    ),
  });

  const executionPromise = (async () => {
    try {
      const result = await runWithStore(runStore, async () => {
        return await runWithTimeout(async () => {
          return await fn(...args);
        });
      });
      await recordRunResult(db, id, { result: result ? serialize(result) : undefined });
      return result;
    } catch (error) {
      await recordRunResult(db, id, { error: serializeError(error as Error) });
      throw error;
    } finally {
      runRegistry.unregisterRun(id);
    }
  })();

  runRegistry.registerRun(id, {
    store: runStore,
    promise: executionPromise,
    abortController: abortController,
  });

  return id;
}

export async function runWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
  const { runId, db, abortSignal } = getWorkflowStore();
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'start-workflow.ts:78',
      message: 'runWithTimeout entry',
      data: { runId: runId, aborted: abortSignal.aborted },
      timestamp: Date.now(),
      sessionId: 'debug-session',
      hypothesisId: 'B',
    }),
  }).catch(() => {});
  // #endregion

  const abortPromise = new Promise<T>((_, reject) => {
    abortSignal.throwIfAborted();
    abortSignal.addEventListener(
      'abort',
      () => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'start-workflow.ts:87',
            message: 'Abort event fired',
            data: { runId: runId, reason: abortSignal.reason },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            hypothesisId: 'E',
          }),
        }).catch(() => {});
        // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'start-workflow.ts:102',
        message: 'Caught error in runWithTimeout',
        data: {
          runId: runId,
          errorType: error?.constructor?.name,
          isTimeout: error instanceof TimeoutError,
          isDeadline: error instanceof DeadlineError,
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'C',
      }),
    }).catch(() => {});
    // #endregion
    if (error instanceof TimeoutError || error instanceof DeadlineError) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'start-workflow.ts:107',
          message: 'Calling cancelRun',
          data: { runId: runId },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          hypothesisId: 'C',
        }),
      }).catch(() => {});
      // #endregion
      await cancelRun(runId, db);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'start-workflow.ts:111',
          message: 'cancelRun completed',
          data: { runId: runId },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          hypothesisId: 'C',
        }),
      }).catch(() => {});
      // #endregion
    }
    await callPromise.catch(() => {});
    throw error;
  }
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
