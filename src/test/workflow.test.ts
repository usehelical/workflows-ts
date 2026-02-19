import { describe, expect, it } from 'vitest';
import { setupIntegrationTest } from './test-utils';
import { createWorker } from '../main/worker';
import { defineWorkflow } from '../api/workflow';
import { sleep } from '@internal/utils/sleep';
import { checkRunInDb, checkStepInDb, createPromise } from './test-helpers';
import { RunDeadlineExceededError, RunTimedOutError } from '@internal/errors';
import { runStep } from '@api/steps';

const { getDb } = setupIntegrationTest();

const EXECUTOR_ID = 'test-instance';

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
      'exampleWorkflow',
      async (...args: typeof workflowArgs) => {
        expect(args).toEqual(workflowArgs);
        await promise;
        return workflowOutput;
      },
    );

    const instance = createWorker({
      workflows: [exampleWorkflow],
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow, workflowArgs, { timeout: 1000 });

    const status = await run.getStatus();

    expect(status).toBe('pending');

    resolve(undefined);

    const result = await run.waitForResult();

    const newStatus = await run.getStatus();
    expect(newStatus).toBe('success');
    if ('error' in result) {
      throw result.error;
    }
    expect(result.data).toEqual(workflowOutput);

    await checkRunInDb(
      db,
      {
        id: run.id,
        workflowName: workflowName,
        args: workflowArgs,
        expectedStatus: 'success',
        result: workflowOutput,
      },
      EXECUTOR_ID,
    );
  });

  it('should run a failing workflow', async () => {
    const db = getDb();
    const { promise, reject } = createPromise();

    const workflowName = 'exampleWorkflow';
    const exampleWorkflow = defineWorkflow('exampleWorkflow', async () => {
      await runStep(async () => await promise);
      return { greeting: 'Hello, World!' };
    });

    const instance = createWorker({
      workflows: [exampleWorkflow],
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow);

    const status = await run.getStatus();

    expect(status).toBe('pending');

    const error = new Error('Test error');
    reject(error);

    const result = await run.waitForResult();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toEqual(error);
    }

    const newStatus = await run.getStatus();
    expect(newStatus).toBe('error');

    await checkRunInDb(
      db,
      {
        id: run.id,
        workflowName: workflowName,
        args: [],
        expectedStatus: 'error',
        error: error,
      },
      EXECUTOR_ID,
    );
    await checkStepInDb(db, run.id, {
      sequenceNumber: 0,
      error: error,
    });
  });

  it('should run a workflow that returns void', async () => {
    const db = getDb();

    const workflowName = 'exampleWorkflow';
    const exampleWorkflow = defineWorkflow('exampleWorkflow', async () => {
      return;
    });

    const instance = createWorker({
      workflows: [exampleWorkflow],
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow);

    const result = await run.waitForResult();
    expect(result.success).toBe(true);
    const status = await run.getStatus();
    expect(status).toBe('success');

    await checkRunInDb(
      db,
      {
        id: run.id,
        workflowName: workflowName,
        args: [],
        expectedStatus: 'success',
      },
      EXECUTOR_ID,
    );
  });

  it('should handle workflow cancellation', async () => {
    const db = getDb();

    const workflowName = 'exampleWorkflow';
    const { promise } = createPromise();
    const exampleWorkflow = defineWorkflow('exampleWorkflow', async () => {
      await promise;
      return { greeting: 'Hello, World!' };
    });

    const instance = createWorker({
      workflows: [exampleWorkflow],
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow);

    const status = await run.getStatus();
    expect(status).toBe('pending');

    await instance.cancelRun(run.id);

    const newStatus = await run.getStatus();
    expect(newStatus).toBe('cancelled');

    await checkRunInDb(
      db,
      {
        id: run.id,
        workflowName: workflowName,
        args: [],
        expectedStatus: 'cancelled',
      },
      EXECUTOR_ID,
    );
  });

  it('should handle workflow timeout', async () => {
    const db = getDb();
    const workflowName = 'exampleWorkflow';
    const { promise } = createPromise();
    const exampleWorkflow = defineWorkflow('exampleWorkflow', async () => {
      await promise;
    });

    const instance = createWorker({
      workflows: [exampleWorkflow],
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow, { timeout: 100 });

    const status = await run.getStatus();
    expect(status).toBe('pending');

    await sleep(101);

    const newStatus = await run.getStatus();
    expect(newStatus).toBe('error');

    await checkRunInDb(
      db,
      {
        id: run.id,
        workflowName: workflowName,
        args: [],
        expectedStatus: 'error',
        error: new RunTimedOutError(),
      },
      EXECUTOR_ID,
    );
  });

  it('should handle workflow deadline', async () => {
    const db = getDb();
    const workflowName = 'exampleWorkflow';
    const { promise } = createPromise();
    const exampleWorkflow = defineWorkflow('exampleWorkflow', async () => {
      await promise;
    });

    const instance = createWorker({
      workflows: [exampleWorkflow],
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow, {
      deadline: Date.now() + 100,
    });

    const status = await run.getStatus();
    expect(status).toBe('pending');

    await sleep(101);

    const newStatus = await run.getStatus();
    expect(newStatus).toBe('error');

    await checkRunInDb(
      db,
      {
        id: run.id,
        workflowName: workflowName,
        args: [],
        expectedStatus: 'error',
        error: new RunDeadlineExceededError(),
      },
      EXECUTOR_ID,
    );
  });
});
