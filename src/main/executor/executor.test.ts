import { describe, it, expect } from 'vitest';
import { setupIntegrationTest } from '../../test/test-utils';
import { createExecutor } from '.';
import { createSimpleWorkflow } from '../../test/test-helpers';
import { defineWorkflow } from '../../api';

const { getDb } = setupIntegrationTest();

describe('Workflow Runtime with PGLite', () => {
  it('should setup notify listeners', async () => {});

  it('should setup queue manager', async () => {});

  it('should recover pending runs', async () => {
    const db = getDb();
    // add test data to the database with status 'pending' and executor_id 'test-executor'
    await db
      .insertInto('runs')
      .values({
        id: 'test-run-id',
        path: ['testWorkflow'],
        workflow_name: 'testWorkflow',
        status: 'pending',
        executor_id: 'test-executor',
      })
      .execute();

    const testWorkflow = defineWorkflow('testWorkflow', createSimpleWorkflow());

    const instance = createExecutor({
      workflows: [testWorkflow],
      options: {
        connectionString: 'dummy',
        instanceId: 'test-executor',
      },
    });

    // await the runresult to be 'success'
    const result = await instance.waitForRunResult('test-run-id');
    expect(result.success).toBe(true);
  });
});
