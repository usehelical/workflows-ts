import { Database } from '../core/internal/db/db';
import { deserializeError, serialize } from '../core/internal/utils/serialization';
import { runStep } from '../core/steps/run-step';
import { RunStatus } from '../core/workflow';

export function createSimpleWorkflow<TReturn = unknown>(
  steps: (() => Promise<unknown>)[] = [],
  args?: unknown[],
  returnFn?: (stepResults: unknown[]) => TReturn,
) {
  return async (): Promise<TReturn> => {
    const stepResults = [];
    for (const step of steps) {
      stepResults.push(await runStep(step));
    }
    if (returnFn) {
      return returnFn(stepResults);
    }
    // Return last step result if no returnFn provided
    return stepResults[stepResults.length - 1] as TReturn;
  };
}

export function createPromise<T>() {
  let resolvePromise: (v: T) => void;
  let rejectPromise: (e: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise!, reject: rejectPromise! };
}

export async function checkRunInDb(
  db: Database,
  run: {
    id: string;
    workflowName: string;
    args: unknown[];
    expectedStatus: RunStatus;
    result?: unknown;
    error?: Error;
  },
  executorId?: string,
) {
  const runs = await db.selectFrom('runs').selectAll().where('id', '=', run.id).executeTakeFirst();
  expect(runs).toBeDefined();
  expect(runs?.workflow_name).toBe(run.workflowName);
  expect(runs?.inputs).toBe(JSON.stringify(run.args));
  expect(runs?.status).toBe(run.expectedStatus);
  if (executorId) {
    expect(runs?.executor_id).toBe(executorId);
  }
  if (run.result) {
    expect(runs?.output).toBe(serialize(run.result));
  } else {
    expect(runs?.output).toBeNull();
  }
  if (run.error) {
    expect(runs?.error).toBeDefined();
    const deserializedError = deserializeError(runs!.error!);
    expect(deserializedError.name).toBe(run.error.name);
    expect(deserializedError.message).toBe(run.error.message);
  } else {
    expect(runs?.error).toBeNull();
  }
}

export async function checkStepInDb(
  db: Database,
  runId: string,
  step: {
    sequenceNumber: number;
    result?: unknown;
    error?: Error;
  },
) {
  const steps = await db
    .selectFrom('operations')
    .selectAll()
    .where('sequence_id', '=', step.sequenceNumber)
    .where('run_id', '=', runId)
    .executeTakeFirst();
  expect(steps).toBeDefined();
  if (step.result) {
    expect(steps?.output).toBe(serialize(step.result));
  } else {
    expect(steps?.output).toBeNull();
  }
  if (step.error) {
    expect(steps?.error).toBeDefined();
    const deserializedError = deserializeError(steps!.error!);
    expect(deserializedError.name).toBe(step.error.name);
    expect(deserializedError.message).toBe(step.error.message);
  } else {
    expect(steps?.error).toBeNull();
  }
}
