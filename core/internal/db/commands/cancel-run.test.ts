import { describe, it, expect } from 'vitest';
import { sql } from 'kysely';
import { setupIntegrationTest } from '../../../../test/test-utils';
import { cancelRun } from './cancel-run';
import { RunNotFoundError } from '../../errors';

const { getDb } = setupIntegrationTest();

describe('cancelRun', () => {
  describe('without cascade', () => {
    it('should cancel a run successfully', async () => {
      const db = getDb();

      // Insert a test run
      await db
        .insertInto('runs')
        .values({
          id: 'test-run-1',
          path: ['testWorkflow'],
          workflow_name: 'testWorkflow',
          status: 'running',
          change_id: 1,
        })
        .execute();

      // Cancel the run
      const result = await cancelRun('test-run-1', db);

      // Check result
      expect(result).toEqual({
        path: ['testWorkflow'],
        changeId: 1,
      });

      // Verify the status was updated
      const updatedRun = await db
        .selectFrom('runs')
        .select(['status'])
        .where('id', '=', 'test-run-1')
        .executeTakeFirst();

      expect(updatedRun?.status).toBe('cancelled');
    });

    it('should throw RunNotFoundError when run does not exist', async () => {
      const db = getDb();

      await expect(cancelRun('non-existent-run', db)).rejects.toThrow(RunNotFoundError);
    });

    it('should throw RunNotFoundError when trying to cancel with empty result', async () => {
      const db = getDb();

      // Insert a run that already completed
      await db
        .insertInto('runs')
        .values({
          id: 'completed-run',
          path: ['testWorkflow'],
          workflow_name: 'testWorkflow',
          status: 'success',
          change_id: 1,
        })
        .execute();

      // Attempt to cancel should throw
      await expect(cancelRun('completed-run', db)).rejects.toThrow(RunNotFoundError);
    });
  });

  describe('with cascade', () => {
    it('should cancel a run and its children successfully', async () => {
      const db = getDb();

      // Insert parent run
      await db
        .insertInto('runs')
        .values({
          id: 'parent-run',
          path: ['parent-run'],
          workflow_name: 'parentWorkflow',
          status: 'running',
          change_id: 1,
        })
        .execute();

      // Insert child runs
      await db
        .insertInto('runs')
        .values([
          {
            id: 'child-run-1',
            path: ['parent-run', 'child-run-1'],
            workflow_name: 'childWorkflow',
            status: 'running',
            change_id: 2,
          },
          {
            id: 'child-run-2',
            path: ['parent-run', 'child-run-2'],
            workflow_name: 'childWorkflow',
            status: 'pending',
            change_id: 3,
          },
        ])
        .execute();

      // Cancel with cascade
      const result = await cancelRun('parent-run', db, { cascade: true });

      // Check result
      expect(result).toEqual({
        path: ['parent-run'],
        changeId: 1,
      });

      // Verify parent was cancelled
      const parentRun = await db
        .selectFrom('runs')
        .select(['status'])
        .where('id', '=', 'parent-run')
        .executeTakeFirst();
      expect(parentRun?.status).toBe('cancelled');

      // Verify children were cancelled
      const childRuns = await db
        .selectFrom('runs')
        .select(['id', 'status'])
        .where('id', 'in', ['child-run-1', 'child-run-2'])
        .execute();

      expect(childRuns).toHaveLength(2);
      childRuns.forEach((run) => {
        expect(run.status).toBe('cancelled');
      });
    });

    it('should not cancel children that are already in terminal state', async () => {
      const db = getDb();

      // Insert parent run
      await db
        .insertInto('runs')
        .values({
          id: 'parent-run-2',
          path: ['parent-run-2'],
          workflow_name: 'parentWorkflow',
          status: 'running',
          change_id: 1,
        })
        .execute();

      // Insert child runs with different statuses
      await db
        .insertInto('runs')
        .values([
          {
            id: 'child-success',
            path: ['parent-run-2', 'child-success'],
            workflow_name: 'childWorkflow',
            status: 'success',
            change_id: 2,
          },
          {
            id: 'child-error',
            path: ['parent-run-2', 'child-error'],
            workflow_name: 'childWorkflow',
            status: 'error',
            change_id: 3,
          },
          {
            id: 'child-running',
            path: ['parent-run-2', 'child-running'],
            workflow_name: 'childWorkflow',
            status: 'running',
            change_id: 4,
          },
        ])
        .execute();

      // Cancel with cascade
      await cancelRun('parent-run-2', db, { cascade: true });

      // Verify only the running child was cancelled
      const childRuns = await db
        .selectFrom('runs')
        .select(['id', 'status'])
        .where(sql<boolean>`path @> ARRAY['parent-run-2']::text[]`)
        .where('id', '!=', 'parent-run-2')
        .execute();

      const childSuccess = childRuns.find((r) => r.id === 'child-success');
      const childError = childRuns.find((r) => r.id === 'child-error');
      const childRunning = childRuns.find((r) => r.id === 'child-running');

      expect(childSuccess?.status).toBe('success');
      expect(childError?.status).toBe('error');
      expect(childRunning?.status).toBe('cancelled');
    });

    it('should return undefined when run is already in terminal state', async () => {
      const db = getDb();

      // Insert a run that already completed
      await db
        .insertInto('runs')
        .values({
          id: 'cancelled-run',
          path: ['testWorkflow'],
          workflow_name: 'testWorkflow',
          status: 'cancelled',
          change_id: 1,
        })
        .execute();

      // Attempt to cancel with cascade should return undefined
      const result = await cancelRun('cancelled-run', db, { cascade: true });
      expect(result).toBeUndefined();
    });

    it('should throw RunNotFoundError when run does not exist with cascade', async () => {
      const db = getDb();

      await expect(cancelRun('non-existent-run', db, { cascade: true })).rejects.toThrow(
        RunNotFoundError,
      );
    });
  });

  describe('edge cases', () => {
    it('should update updated_at timestamp', async () => {
      const db = getDb();

      // Insert a test run with a known timestamp
      const initialTimestamp = Date.now() - 10000; // 10 seconds ago
      await db
        .insertInto('runs')
        .values({
          id: 'timestamp-test',
          path: ['testWorkflow'],
          workflow_name: 'testWorkflow',
          status: 'running',
          change_id: 1,
          updated_at: BigInt(initialTimestamp),
        })
        .execute();

      // Cancel the run
      await cancelRun('timestamp-test', db);

      // Verify updated_at changed
      const updatedRun = await db
        .selectFrom('runs')
        .select(['updated_at'])
        .where('id', '=', 'timestamp-test')
        .executeTakeFirst();

      expect(Number(updatedRun?.updated_at)).toBeGreaterThan(initialTimestamp);
    });

    it('should only cancel runs not in terminal states', async () => {
      const db = getDb();

      // Insert runs with various statuses
      await db
        .insertInto('runs')
        .values([
          {
            id: 'pending-run',
            path: ['pending-run'],
            workflow_name: 'test',
            status: 'pending',
            change_id: 1,
          },
          {
            id: 'running-run',
            path: ['running-run'],
            workflow_name: 'test',
            status: 'running',
            change_id: 2,
          },
        ])
        .execute();

      // Cancel both runs
      await cancelRun('pending-run', db);
      await cancelRun('running-run', db);

      // Verify both were cancelled
      const runs = await db
        .selectFrom('runs')
        .select(['id', 'status'])
        .where('id', 'in', ['pending-run', 'running-run'])
        .execute();

      expect(runs).toHaveLength(2);
      runs.forEach((run) => {
        expect(run.status).toBe('cancelled');
      });
    });
  });
});
