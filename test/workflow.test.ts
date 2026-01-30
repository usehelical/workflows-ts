import { describe, expect, it } from 'vitest';
import { setupIntegrationTest } from './test-utils';
import { createInstance } from '../client/runtime';
import { defineWorkflow, WorkflowStatus } from '../core/workflow';
import { sleep } from '../core/internal/utils/sleep';
import {
  checkRunInDb,
  checkStepInDb,
  createPromise,
  createResolvableStep,
  createSimpleWorkflow,
} from './test-helpers';

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
      createSimpleWorkflow([createResolvableStep(promise)], workflowArgs, () => {
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

    // @ts-expect-error - args is optional
    const run = await instance.runWorkflow(exampleWorkflow, workflowArgs);

    const status = await run.status();

    expect(status).toBe(WorkflowStatus.PENDING);

    resolve(undefined);

    const result = await run.result();

    const newStatus = await run.status();
    expect(newStatus).toBe(WorkflowStatus.SUCCESS);

    expect(result).toEqual(workflowOutput);

    await checkRunInDb(
      db,
      {
        id: run.id,
        workflowName: workflowName,
        args: workflowArgs,
        expectedStatus: WorkflowStatus.SUCCESS,
        result: workflowOutput,
      },
      EXECUTOR_ID,
    );
    await checkStepInDb(db, run.id, {
      sequenceNumber: 0,
    });
  });

  it('should run a failing workflow', async () => {
    const db = getDb();
    const { promise, reject } = createPromise();

    const workflowName = 'exampleWorkflow';
    const exampleWorkflow = defineWorkflow(createSimpleWorkflow([createResolvableStep(promise)]));

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow);

    const status = await run.status();

    expect(status).toBe(WorkflowStatus.PENDING);

    const error = new Error('Test error');
    reject(error);

    try {
      await run.result();
      throw new Error('Expected error to be thrown');
    } catch (e) {
      expect((e as Error).message).toBe(error.message);
    }

    const newStatus = await run.status();
    expect(newStatus).toBe(WorkflowStatus.ERROR);

    await checkRunInDb(
      db,
      {
        id: run.id,
        workflowName: workflowName,
        args: [],
        expectedStatus: WorkflowStatus.ERROR,
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
    const exampleWorkflow = defineWorkflow(createSimpleWorkflow([]));

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow);

    const result = await run.result();
    expect(result).toBeUndefined();
    const status = await run.status();
    expect(status).toBe(WorkflowStatus.SUCCESS);

    await checkRunInDb(
      db,
      {
        id: run.id,
        workflowName: workflowName,
        args: [],
        expectedStatus: WorkflowStatus.SUCCESS,
      },
      EXECUTOR_ID,
    );
  });

  it('should handle workflow cancellation', async () => {
    const db = getDb();

    const workflowName = 'exampleWorkflow';
    const { promise } = createPromise();
    const exampleWorkflow = defineWorkflow(createSimpleWorkflow([createResolvableStep(promise)]));

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow);

    const status = await run.status();
    expect(status).toBe(WorkflowStatus.PENDING);

    await instance.cancelRun(run.id);

    const newStatus = await run.status();
    expect(newStatus).toBe(WorkflowStatus.CANCELLED);

    await checkRunInDb(
      db,
      {
        id: run.id,
        workflowName: workflowName,
        args: [],
        expectedStatus: WorkflowStatus.CANCELLED,
      },
      EXECUTOR_ID,
    );
  });

  it('should handle workflow timeout', async () => {
    const db = getDb();
    const workflowName = 'exampleWorkflow';
    const { promise } = createPromise();
    const exampleWorkflow = defineWorkflow(createSimpleWorkflow([createResolvableStep(promise)]));

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow, undefined, { timeout: 100 });

    const status = await run.status();
    expect(status).toBe(WorkflowStatus.PENDING);

    await sleep(101);

    const newStatus = await run.status();
    expect(newStatus).toBe(WorkflowStatus.CANCELLED);

    await checkRunInDb(
      db,
      {
        id: run.id,
        workflowName: workflowName,
        args: [],
        expectedStatus: WorkflowStatus.CANCELLED,
      },
      EXECUTOR_ID,
    );
  });

  it('should handle workflow deadline', async () => {
    const db = getDb();
    const workflowName = 'exampleWorkflow';
    const { promise } = createPromise();
    const exampleWorkflow = defineWorkflow(createSimpleWorkflow([createResolvableStep(promise)]));

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: {
        connectionString: 'dummy',
        instanceId: EXECUTOR_ID,
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow, undefined, {
      deadline: Date.now() + 100,
    });

    const status = await run.status();
    expect(status).toBe(WorkflowStatus.PENDING);

    await sleep(101);

    const newStatus = await run.status();
    expect(newStatus).toBe(WorkflowStatus.CANCELLED);

    await checkRunInDb(
      db,
      {
        id: run.id,
        workflowName: workflowName,
        args: [],
        expectedStatus: WorkflowStatus.CANCELLED,
      },
      EXECUTOR_ID,
    );
  });
});
