import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recoverPendingRuns } from './recover-pending-runs';
import {
  setupIntegrationTest,
  createTestRuntimeContext,
  waitForPolling,
} from '../../test/test-utils';
import { serialize } from './utils/serialization';
import { createPromise } from '../../test/test-helpers';

const { getDb } = setupIntegrationTest();

describe('recoverPendingRuns', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should recover pending runs successfully', async () => {
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
        testWorkflow: () => ({ fn: workflowFn, config: {} }),
      },
    });
    const ctx = setup.ctx;
    await setup.notifySetup;

    await db
      .insertInto('runs')
      .values({
        id: 'pending-run-1',
        path: ['pending-run-1'],
        workflow_name: 'testWorkflow',
        status: 'pending',
        executor_id: 'test-executor',
        inputs: serialize(['arg1', 'arg2']),
        change_id: 1,
      })
      .execute();

    await recoverPendingRuns(ctx);

    const result = await promise;
    expect(result).toBe('arg1-arg2');
    expect(workflowFn).toHaveBeenCalledWith('arg1', 'arg2');

    await waitForPolling();
    const run = await db
      .selectFrom('runs')
      .selectAll()
      .where('id', '=', 'pending-run-1')
      .executeTakeFirst();
    expect(run?.status).toBe('success');

    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });

  it('should skip recovery when workflow not found', async () => {
    const db = getDb();
    const setup = createTestRuntimeContext({
      executorId: 'test-executor',
      workflows: {},
    });
    const ctx = setup.ctx;
    await setup.notifySetup;

    await db
      .insertInto('runs')
      .values({
        id: 'pending-run-unknown',
        path: ['pending-run-unknown'],
        workflow_name: 'unknownWorkflow',
        status: 'pending',
        executor_id: 'test-executor',
        inputs: serialize([]),
        change_id: 1,
      })
      .execute();

    await recoverPendingRuns(ctx);

    expect(consoleErrorSpy).toHaveBeenCalledWith('Workflow unknownWorkflow not found for recovery');
    const run = await db
      .selectFrom('runs')
      .selectAll()
      .where('id', '=', 'pending-run-unknown')
      .executeTakeFirst();
    expect(run?.status).toBe('pending');

    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });

  it('should recover multiple pending runs', async () => {
    const db = getDb();
    const callCount = { count: 0 };
    const { promise, resolve } = createPromise<void>();

    const workflowFn1 = vi.fn().mockImplementation(async (...args: unknown[]) => {
      callCount.count++;
      if (callCount.count === 2) resolve();
      return `result1-${args[0]}`;
    });
    const workflowFn2 = vi.fn().mockImplementation(async (...args: unknown[]) => {
      callCount.count++;
      if (callCount.count === 2) resolve();
      return `result2-${args[0]}`;
    });

    const setup = createTestRuntimeContext({
      executorId: 'test-executor',
      workflows: {
        workflow1: () => ({ fn: workflowFn1, config: {} }),
        workflow2: () => ({ fn: workflowFn2, config: {} }),
      },
    });
    const ctx = setup.ctx;
    await setup.notifySetup;

    await db
      .insertInto('runs')
      .values([
        {
          id: 'pending-run-1',
          path: ['pending-run-1'],
          workflow_name: 'workflow1',
          status: 'pending',
          executor_id: 'test-executor',
          inputs: serialize(['arg1']),
          change_id: 1,
        },
        {
          id: 'pending-run-2',
          path: ['pending-run-2'],
          workflow_name: 'workflow2',
          status: 'pending',
          executor_id: 'test-executor',
          inputs: serialize(['arg2']),
          change_id: 1,
        },
      ])
      .execute();

    await recoverPendingRuns(ctx);
    await promise;

    expect(workflowFn1).toHaveBeenCalledWith('arg1');
    expect(workflowFn2).toHaveBeenCalledWith('arg2');

    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });

  it('should only recover runs for current executor', async () => {
    const db = getDb();
    const { promise, resolve } = createPromise<void>();
    const workflowFn = vi.fn().mockImplementation(async () => {
      resolve();
      return 'result';
    });

    const setup = createTestRuntimeContext({
      executorId: 'test-executor',
      workflows: {
        testWorkflow: () => ({ fn: workflowFn, config: {} }),
      },
    });
    const ctx = setup.ctx;
    await setup.notifySetup;

    await db
      .insertInto('runs')
      .values([
        {
          id: 'pending-run-this',
          path: ['pending-run-this'],
          workflow_name: 'testWorkflow',
          status: 'pending',
          executor_id: 'test-executor',
          inputs: serialize([]),
          change_id: 1,
        },
        {
          id: 'pending-run-other',
          path: ['pending-run-other'],
          workflow_name: 'testWorkflow',
          status: 'pending',
          executor_id: 'other-executor',
          inputs: serialize([]),
          change_id: 1,
        },
      ])
      .execute();

    await recoverPendingRuns(ctx);
    await promise;

    expect(workflowFn).toHaveBeenCalledTimes(1);

    await waitForPolling();
    const thisRun = await db
      .selectFrom('runs')
      .selectAll()
      .where('id', '=', 'pending-run-this')
      .executeTakeFirst();
    const otherRun = await db
      .selectFrom('runs')
      .selectAll()
      .where('id', '=', 'pending-run-other')
      .executeTakeFirst();

    expect(thisRun?.status).toBe('success');
    expect(otherRun?.status).toBe('pending');

    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });
});
