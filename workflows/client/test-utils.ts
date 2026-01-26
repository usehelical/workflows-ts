import { beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase,
  teardownTestDatabase,
  interceptDbClient,
  clearTestDatabase,
} from './test-setup';
import { Kysely } from 'kysely';
import { DB } from '../core/internal/db/types';

let testDb: Kysely<DB>;

/**
 * Reusable test setup for integration tests that need a database.
 * Call this in your test file to automatically set up and tear down the test database.
 *
 * @example
 * ```typescript
 * import { setupIntegrationTest } from './test-utils';
 *
 * const { getDb } = setupIntegrationTest();
 *
 * describe('My Integration Test', () => {
 *   it('should work', async () => {
 *     const db = getDb();
 *     // use db in your test
 *   });
 * });
 * ```
 */
export function setupIntegrationTest() {
  beforeAll(async () => {
    testDb = await setupTestDatabase();
    interceptDbClient(testDb);
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase(testDb);
  });

  return {
    /**
     * Get the test database instance
     */
    getDb: () => testDb,
  };
}
