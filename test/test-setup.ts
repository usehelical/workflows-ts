import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { Kysely } from 'kysely';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DB } from '../core/internal/db/types';
import { vi } from 'vitest';
import { createPgLiteDriver, DbDriver } from '../core/internal/db/driver';

let pgliteInstance: PGlite | null = null;

export async function setupTestDatabase(): Promise<void> {
  pgliteInstance = new PGlite({
    extensions: { uuid_ossp },
  });

  const migrationPath = join(__dirname, '../core/internal/db/migrations/init.up.sql');
  const migrationSql = readFileSync(migrationPath, 'utf-8');

  await pgliteInstance.exec(migrationSql);
}

export async function teardownTestDatabase(): Promise<void> {
  if (pgliteInstance) {
    try {
      if (pgliteInstance.closed === false) {
        await pgliteInstance.close();
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      // Silently ignore errors if already closed
    }
    pgliteInstance = null;
  }
}

export function createTestDriver(): DbDriver {
  if (!pgliteInstance) {
    throw new Error('PGlite instance not initialized. Call setupTestDatabase() first.');
  }
  return createPgLiteDriver(pgliteInstance);
}

vi.mock('../core/internal/db/driver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/internal/db/driver')>();
  return {
    ...actual,
    createPgDriver: vi.fn(() => {
      if (!pgliteInstance) {
        throw new Error('PGlite instance not initialized. Call setupTestDatabase() first.');
      }
      return createPgLiteDriver(pgliteInstance);
    }),
  };
});

export function getTestPgLite(): PGlite {
  if (!pgliteInstance) {
    throw new Error('PGlite instance not initialized. Call setupTestDatabase() first.');
  }
  return pgliteInstance;
}

export function getTestDb(): Kysely<DB> {
  return createTestDriver().db;
}

export async function clearTestDatabase(db: Kysely<DB>): Promise<void> {
  await db.deleteFrom('messages').execute();
  await db.deleteFrom('operations').execute();
  await db.deleteFrom('state_history').execute();
  await db.deleteFrom('state').execute();
  await db.deleteFrom('runs').execute();
}
