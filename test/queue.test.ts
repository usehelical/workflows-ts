import { describe, it } from 'vitest';
import { setupIntegrationTest } from './test-utils';
import { createInstance } from '../client/runtime';
import { defineWorkflow } from '../core/workflow';
import { defineQueue } from '../core/queue';
import { sleep } from '../core/internal/utils/sleep';
import { checkRunInDb, checkStepInDb, createSimpleWorkflow } from './test-helpers';

const { getDb } = setupIntegrationTest();

describe('Queue', () => {
  describe('Basic Queue Workflow - Same Instance', () => {
    it('should add a queued workflow', async () => {
      const db = getDb();
      const instanceId = 'instance-1';

      const workflowArgs = ['okargs', { name: 'John', age: 30 }];
      const workflowName = 'exampleWorkflow';
      const workflowOutput = {
        greeting: `Hello, World!`,
        user: { name: 'John', age: 30 },
      };

      const exampleWorkflow = defineWorkflow(
        createSimpleWorkflow([() => Promise.resolve()], workflowArgs, () => {
          return workflowOutput;
        }),
      );

      const exampleQueue = defineQueue();

      const instance = createInstance({
        workflows: { exampleWorkflow },
        options: {
          connectionString: 'dummy',
          instanceId,
        },
      });

      // @ts-expect-error - args is optional
      const run = await instance.queueWorkflow('exampleQueue', exampleWorkflow, workflowArgs, {
        timeout: 1000,
      });

      // check wether the workflow has been queued
      const runStatus = await run.getStatus();
      expect(runStatus).toBe('queued');
      await checkRunInDb(db, {
        id: run.id,
        workflowName: workflowName,
        args: workflowArgs,
        expectedStatus: 'queued',
      });

      // spawn new instance that can take the workflow out of the queue
      createInstance({
        workflows: { exampleWorkflow },
        queues: { exampleQueue },
        options: {
          connectionString: 'dummy',
          instanceId: 'instance-2',
        },
      });

      // wait for queue manager to pick up the workflow
      await sleep(1500);

      // check wether the workflow has been executed
      await checkRunInDb(db, {
        id: run.id,
        workflowName: workflowName,
        args: workflowArgs,
        expectedStatus: 'success',
        result: workflowOutput,
      });
      await checkStepInDb(db, run.id, {
        sequenceNumber: 0,
      });
    });

    it.todo('should queue workflow by name string', async () => {
      const db = getDb();
      const instanceId = 'instance-1';

      const workflowArgs = ['okargs', { name: 'John', age: 30 }];
      const workflowName = 'exampleWorkflow';
      const workflowOutput = {
        greeting: `Hello, World!`,
        user: { name: 'John', age: 30 },
      };

      const exampleWorkflow = defineWorkflow(
        createSimpleWorkflow([() => Promise.resolve()], workflowArgs, () => {
          return workflowOutput;
        }),
      );

      const exampleQueue = defineQueue();

      const instance = createInstance({
        workflows: { exampleWorkflow },
        queues: { exampleQueue },
        options: {
          connectionString: 'dummy',
          instanceId,
        },
      });

      // @ts-expect-error - args is optional
      const run = await instance.queueWorkflow('exampleQueue', exampleWorkflow, workflowArgs, {
        timeout: 1000,
      });

      // check wether the workflow has been queued
      const runStatus = await run.getStatus();
      expect(runStatus).toBe('queued');
      await checkRunInDb(db, {
        id: run.id,
        workflowName: workflowName,
        args: workflowArgs,
        expectedStatus: 'queued',
      });
    });
  });

  describe('Cross-Instance Queue and Execute', () => {
    it.todo('should queue on one instance and execute on another (use empty queue array for that)');
    it.todo('should allow multiple instances to hold handles to same run');
  });

  describe('Cancellation', () => {
    it.todo('should cancel workflow while still in QUEUED state', async () => {
      const db = getDb();
      const instanceId = 'instance-1';

      const workflowArgs = ['okargs', { name: 'John', age: 30 }];
      const workflowName = 'exampleWorkflow';
      const workflowOutput = {
        greeting: `Hello, World!`,
        user: { name: 'John', age: 30 },
      };

      const exampleWorkflow = defineWorkflow(
        createSimpleWorkflow([() => Promise.resolve()], workflowArgs, () => {
          return workflowOutput;
        }),
      );

      const exampleQueue = defineQueue();

      const instance = createInstance({
        workflows: { exampleWorkflow },
        queues: { exampleQueue },
        options: {
          connectionString: 'dummy',
          instanceId,
        },
      });

      // @ts-expect-error - args is optional
      const run = await instance.queueWorkflow('exampleQueue', exampleWorkflow, workflowArgs, {
        timeout: 1000,
      });

      await instance.cancelRun(run.id);

      const runStatus = await run.getStatus();
      expect(runStatus).toBe('cancelled');
      await checkRunInDb(db, {
        id: run.id,
        workflowName: workflowName,
        args: workflowArgs,
        expectedStatus: 'cancelled',
      });
      await checkStepInDb(db, run.id, {
        sequenceNumber: 0,
      });
    });
  });
});
