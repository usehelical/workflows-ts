import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupIntegrationTest, createTestRuntimeContext } from '../test/test-utils';
import { executeWorkflow } from './execute-workflow';
import { RuntimeContext } from './context/runtime-context';
import { createPromise } from '../test/test-helpers';
import { ExecutionContext } from './context/execution-context';
import { RunDeadlineExceededError, RunTimedOutError } from './errors';
import { deserializeError } from './utils/serialization';
import { runStep } from '@api/steps/run-step';

const { getDb } = setupIntegrationTest();

describe('executeWorkflow', () => {
  let ctx: RuntimeContext;

  beforeEach(async () => {
    // Create a fresh runtime context for each test, matching production setup
    const setup = createTestRuntimeContext();
    ctx = setup.ctx;

    // Wait for NOTIFY to be set up
    await setup.notifySetup;

    // Insert a test run that executeWorkflow will update
    await ctx.db
      .insertInto('runs')
      .values({
        id: 'test-run-id',
        path: ['test-run-id'],
        workflow_name: 'testWorkflow',
        status: 'pending',
        change_id: 1,
        inputs: JSON.stringify([]),
      })
      .execute();
  });

  afterEach(() => {
    // Clean up event buses to stop polling loops
    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });

  describe('successful execution', () => {
    it('should execute workflow and record result', async () => {
      const db = getDb();
      const workflowFn = vi.fn(async () => 'success-result');

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
      });

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify workflow was called
      expect(workflowFn).toHaveBeenCalledOnce();

      // Verify result was recorded in database
      const run = await db
        .selectFrom('runs')
        .select(['status', 'output', 'error'])
        .where('id', '=', 'test-run-id')
        .executeTakeFirst();

      expect(run?.status).toBe('success');
      expect(run?.output).toBe(JSON.stringify('success-result'));
      expect(run?.error).toBeNull();
    });

    it('should execute workflow with arguments', async () => {
      const db = getDb();
      const workflowFn = vi.fn(async (a: number, b: string) => `${a}-${b}`);

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [42, 'test'],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(workflowFn).toHaveBeenCalledWith(42, 'test');

      const run = await db
        .selectFrom('runs')
        .select(['output'])
        .where('id', '=', 'test-run-id')
        .executeTakeFirst();

      expect(run?.output).toBe(JSON.stringify('42-test'));
    });

    it('should handle undefined return value', async () => {
      const db = getDb();
      const workflowFn = vi.fn(async () => undefined);

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const run = await db
        .selectFrom('runs')
        .select(['status', 'output'])
        .where('id', '=', 'test-run-id')
        .executeTakeFirst();

      expect(run?.status).toBe('success');
      expect(run?.output).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should record error when workflow throws', async () => {
      const db = getDb();
      const testError = new Error('Workflow failed');
      const workflowFn = vi.fn(async () => {
        throw testError;
      });

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const run = await db
        .selectFrom('runs')
        .select(['status', 'error', 'output'])
        .where('id', '=', 'test-run-id')
        .executeTakeFirst();

      expect(run?.status).toBe('error');
      expect(run?.output).toBeNull();
      expect(run?.error).toBeDefined();
      expect(run?.error).toContain('Workflow failed');
    });

    it('should record custom error properties', async () => {
      const db = getDb();
      class CustomError extends Error {
        constructor(
          message: string,
          public code: number,
        ) {
          super(message);
          this.name = 'CustomError';
        }
      }
      const testError = new CustomError('Custom error', 500);
      const workflowFn = vi.fn(async () => {
        throw testError;
      });

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const run = await db
        .selectFrom('runs')
        .select(['error'])
        .where('id', '=', 'test-run-id')
        .executeTakeFirst();

      expect(run?.error).toContain('CustomError');
      expect(run?.error).toContain('Custom error');
    });
  });

  describe('run registry management', () => {
    it('should register run before execution and unregister after success', async () => {
      const { promise, resolve } = createPromise<string>();
      const workflowFn = vi.fn(async () => {
        const result = await promise;
        return result;
      });

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
      });

      // Run should be registered
      const entry = ctx.runRegistry.getRun('test-run-id');
      expect(entry).toBeDefined();
      expect(entry?.store).toBeDefined();
      expect(entry?.abortController).toBeDefined();

      // Complete the workflow
      resolve('done');
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Run should be unregistered
      const entryAfter = ctx.runRegistry.getRun('test-run-id');
      expect(entryAfter).toBeUndefined();
    });

    it('should unregister run after error', async () => {
      const { promise, reject } = createPromise<string>();
      const workflowFn = vi.fn(async () => {
        await promise;
      });

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
      });

      // Run should be registered
      expect(ctx.runRegistry.getRun('test-run-id')).toBeDefined();

      // Fail the workflow
      reject(new Error('test error'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Run should be unregistered
      expect(ctx.runRegistry.getRun('test-run-id')).toBeUndefined();
    });
  });

  describe('timeout handling', () => {
    it('should timeout workflow that exceeds timeout option', async () => {
      const db = getDb();
      const { promise } = createPromise<string>();
      const workflowFn = vi.fn(async () => {
        await promise; // Never resolves
      });

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
        options: { timeout: 50 }, // 50ms timeout
      });

      // Wait for timeout to occur
      await new Promise((resolve) => setTimeout(resolve, 100));

      const run = await db
        .selectFrom('runs')
        .select(['status', 'error'])
        .where('id', '=', 'test-run-id')
        .executeTakeFirst();

      expect(run?.status).toBe('error');
      expect((deserializeError(run?.error as string) as RunTimedOutError).reason).toBe('timeout');
    });

    it('should not timeout workflow that completes in time', async () => {
      const db = getDb();
      const workflowFn = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'completed';
      });

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
        options: { timeout: 1000 }, // 1 second timeout
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const run = await db
        .selectFrom('runs')
        .select(['status', 'output'])
        .where('id', '=', 'test-run-id')
        .executeTakeFirst();

      expect(run?.status).toBe('success');
      expect(run?.output).toBe(JSON.stringify('completed'));
    });
  });

  describe('deadline handling', () => {
    it('should timeout workflow that exceeds deadline option', async () => {
      const db = getDb();
      const { promise } = createPromise<string>();
      const workflowFn = vi.fn(async () => {
        await promise;
      });

      const deadline = Date.now() + 50; // 50ms from now

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
        options: { deadline },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const run = await db
        .selectFrom('runs')
        .select(['status', 'error'])
        .where('id', '=', 'test-run-id')
        .executeTakeFirst();

      expect(run?.status).toBe('error');
      expect((deserializeError(run?.error as string) as RunDeadlineExceededError).reason).toBe(
        'deadline',
      );
    });

    it('should use earlier of timeout and deadline', async () => {
      const db = getDb();
      const { promise } = createPromise<string>();
      const workflowFn = vi.fn(async () => {
        await promise;
      });

      const deadline = Date.now() + 1000; // 1 second from now
      const timeout = 50; // 50ms - this is earlier

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
        options: { timeout, deadline },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const run = await db
        .selectFrom('runs')
        .select(['error'])
        .where('id', '=', 'test-run-id')
        .executeTakeFirst();

      // Should timeout (not deadline) since timeout is earlier
      expect(run?.error).toContain('"reason":"timeout"');
      expect(run?.error).toContain('timed out');
    });
  });

  describe('cancellation', () => {
    it('should handle workflow cancellation', async () => {
      const db = getDb();
      const { cancelRun } = await import('./db/commands/cancel-run');

      let stepExecuting = false;
      const workflowFn = vi.fn(async () => {
        // Run a step that checks for cancellation
        await runStep(async () => {
          stepExecuting = true;
          // Simulate work
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'completed';
        });
      });

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
      });

      // Wait for workflow to start executing
      await vi.waitFor(
        () => {
          expect(stepExecuting).toBe(true);
        },
        { timeout: 200 },
      );

      // Cancel the run (like a user would)
      await cancelRun('test-run-id', db);

      // Get the run entry
      const entry = ctx.runRegistry.getRun('test-run-id');
      expect(entry).toBeDefined();

      // Wait for the execution promise to reject with RunCancelledError
      await expect(entry!.promise).rejects.toThrow();

      // Give database operations time to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      const run = await db
        .selectFrom('runs')
        .select(['status', 'error'])
        .where('id', '=', 'test-run-id')
        .executeTakeFirst();

      // When cancelled: status is 'cancelled' (from cancelRun) AND error is recorded (from executeWorkflow)
      expect(run?.status).toBe('cancelled');
      expect(run?.error).toBeDefined();
      expect(run?.error).toContain('"reason":"cancel"');
    });
  });

  describe('execution context', () => {
    it('should create execution context with correct properties', async () => {
      let capturedContext: ExecutionContext | undefined;
      const { promise, resolve } = createPromise<string>();
      const workflowFn = vi.fn(async function () {
        const { getExecutionContext } = await import('./context/execution-context');
        capturedContext = getExecutionContext();
        const result = await promise;
        return result;
      });

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(capturedContext).toBeDefined();
      if (!capturedContext) return;

      expect(capturedContext.runId).toBe('test-run-id');
      expect(capturedContext.runPath).toEqual(['test-run-id']);
      expect(capturedContext.executorId).toBe(ctx.executorId);
      expect(capturedContext.abortSignal).toBeDefined();

      resolve('done');
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('should pass operations to execution context', async () => {
      let capturedContext: ExecutionContext | undefined;
      const { promise, resolve } = createPromise<string>();
      const workflowFn = vi.fn(async function () {
        const { getExecutionContext } = await import('./context/execution-context');
        capturedContext = getExecutionContext();
        await promise;
        return 'done';
      });

      const operations = [
        {
          result: JSON.stringify('step-result'),
          error: undefined,
        },
      ];

      await executeWorkflow(ctx, {
        runId: 'test-run-id',
        runPath: ['test-run-id'],
        workflowName: 'testWorkflow',
        fn: workflowFn,
        args: [],
        operations,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(capturedContext).toBeDefined();
      if (!capturedContext) return;

      expect(capturedContext.operationManager).toBeDefined();

      resolve('done');
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  });
});
