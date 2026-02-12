import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupIntegrationTest, createTestRuntimeContext, waitForPolling } from '../test/test-utils';
import { waitForRunResult } from './wait-for-run-result';
import { RuntimeContext } from './context/runtime-context';
import { RunNotFoundError, RunCancelledError, UnknownError } from './errors';
import { serializeError } from './utils/serialization';

const { getDb } = setupIntegrationTest();

describe('waitForRunResult', () => {
  let ctx: RuntimeContext;
  let notifySetup: Promise<void>;

  beforeEach(async () => {
    // Use the helper to create context the same way as production with NOTIFY support
    // To use a specific executorId: createTestRuntimeContext({ executorId: 'my-id' })
    const setup = createTestRuntimeContext();
    ctx = setup.ctx;
    notifySetup = setup.notifySetup;

    // Wait for NOTIFY to be set up
    await notifySetup;
  });

  afterEach(() => {
    // Clean up event buses
    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });

  describe('immediate returns - terminal states', () => {
    it('should return error when run does not exist', async () => {
      const result = await waitForRunResult(ctx, 'non-existent-run');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(RunNotFoundError);
        expect(result.error.message).toContain('non-existent-run');
      }
    });

    it('should return cancelled error when run is already cancelled', async () => {
      const db = getDb();

      await db
        .insertInto('runs')
        .values({
          id: 'cancelled-run',
          path: ['cancelled-run'],
          workflow_name: 'testWorkflow',
          status: 'cancelled',
          change_id: 1,
          inputs: JSON.stringify([]),
        })
        .execute();

      const result = await waitForRunResult(ctx, 'cancelled-run');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(RunCancelledError);
      }
    });

    it('should return error when run has already errored', async () => {
      const db = getDb();
      const testError = new Error('Test error message');

      await db
        .insertInto('runs')
        .values({
          id: 'errored-run',
          path: ['errored-run'],
          workflow_name: 'testWorkflow',
          status: 'error',
          change_id: 1,
          inputs: JSON.stringify([]),
          error: serializeError(testError),
        })
        .execute();

      const result = await waitForRunResult(ctx, 'errored-run');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Test error message');
      }
    });

    it('should return generic error when run errored but has no error field', async () => {
      const db = getDb();

      await db
        .insertInto('runs')
        .values({
          id: 'errored-no-details',
          path: ['errored-no-details'],
          workflow_name: 'testWorkflow',
          status: 'error',
          change_id: 1,
          inputs: JSON.stringify([]),
          error: null,
        })
        .execute();

      const result = await waitForRunResult(ctx, 'errored-no-details');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(UnknownError);
      }
    });

    it('should return success result when run has already succeeded with data', async () => {
      const db = getDb();
      const resultData = { value: 42, message: 'completed' };

      await db
        .insertInto('runs')
        .values({
          id: 'success-run',
          path: ['success-run'],
          workflow_name: 'testWorkflow',
          status: 'success',
          change_id: 1,
          inputs: JSON.stringify([]),
          output: JSON.stringify(resultData),
        })
        .execute();

      const result = await waitForRunResult<typeof resultData>(ctx, 'success-run');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(resultData);
      }
    });

    it('should return success result with undefined when run succeeded without output', async () => {
      const db = getDb();

      await db
        .insertInto('runs')
        .values({
          id: 'success-no-output',
          path: ['success-no-output'],
          workflow_name: 'testWorkflow',
          status: 'success',
          change_id: 1,
          inputs: JSON.stringify([]),
          output: null,
        })
        .execute();

      const result = await waitForRunResult(ctx, 'success-no-output');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeUndefined();
      }
    });
  });

  describe('async waiting - non-terminal states', () => {
    it('should wait for pending run to succeed', async () => {
      const db = getDb();
      const resultData = 'workflow-result';

      await db
        .insertInto('runs')
        .values({
          id: 'pending-success',
          path: ['pending-success'],
          workflow_name: 'testWorkflow',
          status: 'pending',
          change_id: 1,
          inputs: JSON.stringify([]),
        })
        .execute();

      // Start waiting for result - will subscribe and start polling
      const resultPromise = waitForRunResult<string>(ctx, 'pending-success');

      // Give subscription time to register
      await waitForPolling();

      // Simulate workflow completion
      await db
        .updateTable('runs')
        .set({
          status: 'success',
          output: JSON.stringify(resultData),
          change_id: 2,
        })
        .where('id', '=', 'pending-success')
        .execute();

      // Wait for polling loop to detect the change
      await waitForPolling();

      const result = await resultPromise;

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(resultData);
      }
    });

    it('should wait for pending run to error', async () => {
      const db = getDb();
      const testError = new Error('Workflow failed');

      await db
        .insertInto('runs')
        .values({
          id: 'pending-error',
          path: ['pending-error'],
          workflow_name: 'testWorkflow',
          status: 'pending',
          change_id: 1,
          inputs: JSON.stringify([]),
        })
        .execute();

      const resultPromise = waitForRunResult(ctx, 'pending-error');

      // Give subscription time to register
      await waitForPolling();

      // Simulate workflow failure
      await db
        .updateTable('runs')
        .set({
          status: 'error',
          error: serializeError(testError),
          change_id: 2,
        })
        .where('id', '=', 'pending-error')
        .execute();

      // Wait for polling loop to detect the change
      await waitForPolling();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Workflow failed');
      }
    });

    it('should wait for pending run to be cancelled', async () => {
      const db = getDb();

      await db
        .insertInto('runs')
        .values({
          id: 'pending-cancel',
          path: ['pending-cancel'],
          workflow_name: 'testWorkflow',
          status: 'pending',
          change_id: 1,
          inputs: JSON.stringify([]),
        })
        .execute();

      const resultPromise = waitForRunResult(ctx, 'pending-cancel');

      // Give subscription time to register
      await waitForPolling();

      // Simulate workflow cancellation
      await db
        .updateTable('runs')
        .set({
          status: 'cancelled',
          change_id: 2,
        })
        .where('id', '=', 'pending-cancel')
        .execute();

      // Wait for polling loop to detect the change
      await waitForPolling();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(RunCancelledError);
      }
    });

    it('should wait for queued run to complete', async () => {
      const db = getDb();
      const resultData = { count: 10 };

      await db
        .insertInto('runs')
        .values({
          id: 'queued-run',
          path: ['queued-run'],
          workflow_name: 'testWorkflow',
          status: 'queued',
          change_id: 1,
          inputs: JSON.stringify([]),
        })
        .execute();

      const resultPromise = waitForRunResult<typeof resultData>(ctx, 'queued-run');

      // Give subscription time to register
      await waitForPolling();

      // Simulate queue processing and completion
      await db
        .updateTable('runs')
        .set({
          status: 'success',
          output: JSON.stringify(resultData),
          change_id: 2,
        })
        .where('id', '=', 'queued-run')
        .execute();

      // Wait for polling loop to detect the change
      await waitForPolling();

      const result = await resultPromise;

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(resultData);
      }
    });
  });

  describe('edge cases', () => {
    it('should return error from DB when error event received', async () => {
      const db = getDb();
      const customError = new Error('Custom workflow error');
      customError.name = 'CustomError';

      await db
        .insertInto('runs')
        .values({
          id: 'pending-custom-error',
          path: ['pending-custom-error'],
          workflow_name: 'testWorkflow',
          status: 'pending',
          change_id: 1,
          inputs: JSON.stringify([]),
        })
        .execute();

      const resultPromise = waitForRunResult(ctx, 'pending-custom-error');

      // Give subscription time to register
      await waitForPolling();

      await db
        .updateTable('runs')
        .set({
          status: 'error',
          error: serializeError(customError),
          change_id: 2,
        })
        .where('id', '=', 'pending-custom-error')
        .execute();

      // Wait for polling loop to detect the change
      await waitForPolling();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Custom workflow error');
        expect(result.error.name).toBe('CustomError');
      }
    });

    it('should handle generic error when error event has no error details', async () => {
      const db = getDb();

      await db
        .insertInto('runs')
        .values({
          id: 'pending-no-error-details',
          path: ['pending-no-error-details'],
          workflow_name: 'testWorkflow',
          status: 'pending',
          change_id: 1,
          inputs: JSON.stringify([]),
        })
        .execute();

      const resultPromise = waitForRunResult(ctx, 'pending-no-error-details');

      // Give subscription time to register
      await waitForPolling();

      await db
        .updateTable('runs')
        .set({
          status: 'error',
          error: null,
          change_id: 2,
        })
        .where('id', '=', 'pending-no-error-details')
        .execute();

      // Wait for polling loop to detect the change
      await waitForPolling();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(UnknownError);
      }
    });
  });
});
