import { describe, it, expect } from 'vitest';
import { setupIntegrationTest } from './test-utils';

const { getDb } = setupIntegrationTest();

describe('Workflow Runtime with PGLite', () => {
  it('should connect to PGLite database', async () => {
    const db = getDb();
    const result = await db.selectFrom('runs').selectAll().execute();
    expect(result).toEqual([]);
  });

  it('should insert a run', async () => {
    const db = getDb();
    await db
      .insertInto('runs')
      .values({
        workflow_name: 'test-workflow',
        status: 'pending',
        path: ['test-workflow'],
      })
      .execute();

    const runs = await db.selectFrom('runs').selectAll().execute();
    expect(runs).toHaveLength(1);
    expect(runs[0].workflow_name).toBe('test-workflow');
    expect(runs[0].status).toBe('pending');
  });
});
