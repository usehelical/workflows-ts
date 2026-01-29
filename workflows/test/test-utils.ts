import { beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase,
  teardownTestDatabase,
  clearTestDatabase,
  createTestDriver,
  getTestDb,
} from './test-setup';
import { Kysely } from 'kysely';
import { DB } from '../core/internal/db/types';
import { DbDriver } from '../core/internal/db/driver';

/**
 * Reusable test setup for integration tests that need a database.
 * Call this in your test file to automatically set up and tear down the test database.
 *
 * @example
 * ```typescript
 * import { setupIntegrationTest } from './test-utils';
 *
 * const { getDb, createDriver } = setupIntegrationTest();
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
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase(getTestDb());
  });

  return {
    /**
     * Get a test database instance
     */
    getDb: (): Kysely<DB> => getTestDb(),
    /**
     * Create a new driver instance for testing cross-process communication.
     * All drivers share the same underlying PGlite instance.
     */
    createDriver: (): DbDriver => createTestDriver(),
  };
}
