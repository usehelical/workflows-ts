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
    getDb: (): Kysely<DB> => getTestDb(),
    createDriver: (): DbDriver => createTestDriver(),
  };
}
