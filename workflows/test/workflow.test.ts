import { describe, expect, it } from 'vitest';
import { setupIntegrationTest } from '../client/test-utils';
import { createInstance } from '../client/runtime';
import { defineWorkflow, WorkflowStatus } from '../core/workflow';
import { Database } from '../core/internal/db/client';
import { defineStep, StepDefinition } from '../core/step';
import { runStep } from '../core/steps/run-step';
import { serialize, deserializeError } from '../core/internal/serialization';
import { sleep } from '../core/internal/utils/sleep';

const { getDb } = setupIntegrationTest();

const EXECUTOR_ID = 'test-instance';

function createSimpleWorkflow(
  steps: (() => StepDefinition<unknown[], unknown>)[] = [],
  args?: unknown[],
  returnFn?: (stepResults: unknown[]) => unknown,
) {
  return async (...args: unknown[]) => {
    const stepResults = [];
    for (const step of steps) {
      stepResults.push(await runStep(step()));
    }
    if (returnFn) {
      return returnFn(stepResults);
    }
  };
}

function createResolvableWorkflowStep(promise: Promise<any>) {
  return defineStep(
    async () => {
      return await promise;
    },
    {
      name: 'resolvable-workflow-step',
    },
  );
}

function createPromise<T>() {
  let resolvePromise: (v: T) => void;
  let rejectPromise: (e: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise!, reject: rejectPromise! };
}

async function checkRunInDb(
  db: Database,
  runId: string,
  workflowName: string,
  args: unknown[],
  expectedStatus: WorkflowStatus,
  result?: unknown,
  error?: Error,
) {
  const runs = await db.selectFrom('runs').selectAll().where('id', '=', runId).executeTakeFirst();
  expect(runs).toBeDefined();
  expect(runs?.workflow_name).toBe(workflowName);
  expect(runs?.inputs).toBe(JSON.stringify(args));
  expect(runs?.status).toBe(expectedStatus);
  expect(runs?.executor_id).toBe(EXECUTOR_ID);
  if (result) {
    expect(runs?.output).toBe(serialize(result));
  } else {
    expect(runs?.output).toBeNull();
  }
  if (error) {
    expect(runs?.error).toBeDefined();
    const deserializedError = deserializeError(runs!.error!);
    expect(deserializedError.name).toBe(error.name);
    expect(deserializedError.message).toBe(error.message);
  } else {
    expect(runs?.error).toBeNull();
  }
}

async function checkStepInDb(
  db: Database,
  sequenceNumber: number,
  result?: unknown,
  error?: Error,
) {
  const steps = await db
    .selectFrom('operations')
    .selectAll()
    .where('sequence_id', '=', sequenceNumber)
    .executeTakeFirst();
  expect(steps).toBeDefined();
  if (result) {
    expect(steps?.output).toBe(serialize(result));
  } else {
    expect(steps?.output).toBeNull();
  }
  if (error) {
    expect(steps?.error).toBeDefined();
    const deserializedError = deserializeError(steps!.error!);
    expect(deserializedError.name).toBe(error.name);
    expect(deserializedError.message).toBe(error.message);
  } else {
    expect(steps?.error).toBeNull();
  }
}

describe('Workflows', () => {
  it('should run a successful workflow', async () => {
    const db = getDb();

    const { promise, resolve } = createPromise();

    const workflowArgs = ['World', { name: 'John', age: 30 }];
    const workflowName = 'exampleWorkflow';
    const workflowOutput = {
      greeting: `Hello, World!`,
      user: { name: 'John', age: 30 },
    };

    const exampleWorkflow = defineWorkflow(
      createSimpleWorkflow([createResolvableWorkflowStep(promise)], workflowArgs, () => {
        return workflowOutput;
      }),
    );

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.startWorkflow(exampleWorkflow, workflowArgs);

    const status = await run.status();

    expect(status).toBe(WorkflowStatus.PENDING);

    resolve(undefined);

    const result = await run.result;

    const newStatus = await run.status();
    expect(newStatus).toBe(WorkflowStatus.SUCCESS);

    expect(result).toEqual(workflowOutput);

    await checkRunInDb(
      db,
      run.id,
      workflowName,
      workflowArgs,
      WorkflowStatus.SUCCESS,
      workflowOutput,
    );
    await checkStepInDb(db, 0);
  });

  it('should run a failing workflow', async () => {
    const db = getDb();
    const { promise, reject } = createPromise();

    const workflowName = 'exampleWorkflow';
    const exampleWorkflow = defineWorkflow(
      createSimpleWorkflow([createResolvableWorkflowStep(promise)]),
    );

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.startWorkflow(exampleWorkflow);

    const status = await run.status();

    expect(status).toBe(WorkflowStatus.PENDING);

    const error = new Error('Test error');
    reject(error);

    try {
      await run.result;
      throw new Error('Expected error to be thrown');
    } catch (e) {
      expect((e as Error).message).toBe(error.message);
    }

    const newStatus = await run.status();
    expect(newStatus).toBe(WorkflowStatus.ERROR);

    await checkRunInDb(db, run.id, workflowName, [], WorkflowStatus.ERROR, undefined, error);
    await checkStepInDb(db, 0, undefined, error);
  });

  it('should run a workflow that returns void', async () => {
    const db = getDb();

    const workflowName = 'exampleWorkflow';
    const exampleWorkflow = defineWorkflow(createSimpleWorkflow([]));

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.startWorkflow(exampleWorkflow);

    const result = await run.result;
    expect(result).toBeUndefined();
    const status = await run.status();
    expect(status).toBe(WorkflowStatus.SUCCESS);

    await checkRunInDb(db, run.id, workflowName, [], WorkflowStatus.SUCCESS);
  });

  it('should handle workflow cancellation', async () => {
    const db = getDb();

    const workflowName = 'exampleWorkflow';
    const { promise } = createPromise();
    const exampleWorkflow = defineWorkflow(
      createSimpleWorkflow([createResolvableWorkflowStep(promise)]),
    );

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.startWorkflow(exampleWorkflow);

    const status = await run.status();
    expect(status).toBe(WorkflowStatus.PENDING);

    await instance.cancelWorkflow(run.id);

    const newStatus = await run.status();
    expect(newStatus).toBe(WorkflowStatus.CANCELLED);

    await checkRunInDb(db, run.id, workflowName, [], WorkflowStatus.CANCELLED);
  });

  it('should handle workflow timeout', async () => {
    const db = getDb();
    const workflowName = 'exampleWorkflow';
    const { promise } = createPromise();
    const exampleWorkflow = defineWorkflow(
      createSimpleWorkflow([createResolvableWorkflowStep(promise)]),
    );

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.startWorkflow(exampleWorkflow, undefined, { timeout: 100 });

    const status = await run.status();
    expect(status).toBe(WorkflowStatus.PENDING);

    await sleep(101);

    const newStatus = await run.status();
    expect(newStatus).toBe(WorkflowStatus.CANCELLED);

    await checkRunInDb(db, run.id, workflowName, [], WorkflowStatus.CANCELLED);
  });

  it('should handle workflow deadline', async () => {
    const db = getDb();
    const workflowName = 'exampleWorkflow';
    const { promise } = createPromise();
    const exampleWorkflow = defineWorkflow(
      createSimpleWorkflow([createResolvableWorkflowStep(promise)]),
    );

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.startWorkflow(exampleWorkflow, undefined, {
      deadline: Date.now() + 100,
    });

    const status = await run.status();
    expect(status).toBe(WorkflowStatus.PENDING);

    await sleep(101);

    const newStatus = await run.status();
    expect(newStatus).toBe(WorkflowStatus.CANCELLED);

    await checkRunInDb(db, run.id, workflowName, [], WorkflowStatus.CANCELLED);
  });
});
