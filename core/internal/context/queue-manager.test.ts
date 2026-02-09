import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueueManager } from './queue-manager';
import {
  setupIntegrationTest,
  createTestRuntimeContext,
  waitForPolling,
} from '../../../test/test-utils';
import { serialize } from '../utils/serialization';
import { createPromise } from '../../../test/test-helpers';

const { getDb } = setupIntegrationTest();

describe('QueueManager', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should dispatch queued runs to workflows', async () => {
    const db = getDb();
    const { promise, resolve } = createPromise<string>();
    const workflowFn = vi.fn().mockImplementation(async (...args: unknown[]) => {
      const result = args.join('-');
      resolve(result);
      return result;
    });

    const setup = createTestRuntimeContext({
      executorId: 'test-executor',
      workflows: {
        testWorkflow: () => ({ fn: workflowFn, config: { queue: 'testQueue' } }),
      },
      queues: {
        testQueue: () => ({ concurrency: 1 }),
      },
    });
    const ctx = setup.ctx;
    await setup.notifySetup;

    await db
      .insertInto('runs')
      .values({
        id: 'queued-run-1',
        path: ['queued-run-1'],
        workflow_name: 'testWorkflow',
        status: 'queued',
        queue_name: 'testQueue',
        executor_id: null,
        inputs: serialize(['arg1', 'arg2']),
        change_id: 1,
      })
      .execute();

    const queueManager = new QueueManager(ctx);
    queueManager.start();

    const result = await promise;
    expect(result).toBe('arg1-arg2');
    expect(workflowFn).toHaveBeenCalledWith('arg1', 'arg2');

    await waitForPolling(100);
    const run = await db
      .selectFrom('runs')
      .selectAll()
      .where('id', '=', 'queued-run-1')
      .executeTakeFirst();
    expect(run?.status).toBe('success');

    queueManager.destroy();
    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });

  it('should handle workflow not found', async () => {
    const db = getDb();
    const setup = createTestRuntimeContext({
      executorId: 'test-executor',
      workflows: {},
      queues: {
        testQueue: () => ({ concurrency: 1 }),
      },
    });
    const ctx = setup.ctx;
    await setup.notifySetup;

    await db
      .insertInto('runs')
      .values({
        id: 'queued-run-unknown',
        path: ['queued-run-unknown'],
        workflow_name: 'unknownWorkflow',
        status: 'queued',
        queue_name: 'testQueue',
        executor_id: null,
        inputs: serialize([]),
        change_id: 1,
      })
      .execute();

    const queueManager = new QueueManager(ctx);
    queueManager.start();

    await waitForPolling(1100);

    expect(consoleErrorSpy).toHaveBeenCalledWith('Workflow unknownWorkflow not found');

    queueManager.destroy();
    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });

  it('should dispatch partitioned queue runs', async () => {
    const db = getDb();
    const callCount = { count: 0 };
    const { promise, resolve } = createPromise<void>();

    const workflowFn = vi.fn().mockImplementation(async (...args: unknown[]) => {
      callCount.count++;
      if (callCount.count === 2) resolve();
      return `result-${args[0]}`;
    });

    const setup = createTestRuntimeContext({
      executorId: 'test-executor',
      workflows: {
        testWorkflow: () => ({ fn: workflowFn, config: { queue: 'partitionedQueue' } }),
      },
      queues: {
        partitionedQueue: () => ({ concurrency: 2, partitioningEnabled: true }),
      },
    });
    const ctx = setup.ctx;
    await setup.notifySetup;

    await db
      .insertInto('runs')
      .values([
        {
          id: 'partition-run-1',
          path: ['partition-run-1'],
          workflow_name: 'testWorkflow',
          status: 'queued',
          queue_name: 'partitionedQueue',
          queue_partition_key: 'partition-a',
          executor_id: null,
          inputs: serialize(['arg1']),
          change_id: 1,
        },
        {
          id: 'partition-run-2',
          path: ['partition-run-2'],
          workflow_name: 'testWorkflow',
          status: 'queued',
          queue_name: 'partitionedQueue',
          queue_partition_key: 'partition-b',
          executor_id: null,
          inputs: serialize(['arg2']),
          change_id: 1,
        },
      ])
      .execute();

    const queueManager = new QueueManager(ctx);
    queueManager.start();

    await promise;

    expect(workflowFn).toHaveBeenCalledTimes(2);
    expect(workflowFn).toHaveBeenCalledWith('arg1');
    expect(workflowFn).toHaveBeenCalledWith('arg2');

    queueManager.destroy();
    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });
});
