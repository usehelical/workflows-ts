import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueueManager } from './queue-manager';
import {
  setupIntegrationTest,
  createTestRuntimeContext,
  waitForPolling,
} from '../../test/test-utils';
import { serialize } from '../utils/serialization';
import { createPromise } from '../../test/test-helpers';
import { defineQueue } from '@api/queue';
import { defineWorkflow } from '@api/workflow';

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
        testWorkflow: defineWorkflow(workflowFn),
      },
      queues: {
        testQueue: defineQueue({ concurrency: 1 }),
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
        testQueue: defineQueue({ concurrency: 1 }),
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

    expect(consoleErrorSpy).toHaveBeenCalled();

    queueManager.destroy();
    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });
});
