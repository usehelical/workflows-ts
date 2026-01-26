import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { Kysely } from 'kysely';
import { KyselyPGlite } from 'kysely-pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DB } from '../core/internal/db/types';
import { vi } from 'vitest';

let pgliteInstance: PGlite | null = null;
let kyselyInstance: Kysely<DB> | null = null;
let mockDbInstance: Kysely<DB> | null = null;

/**
 * Creates a new PGLite instance and runs migrations
 */
export async function setupTestDatabase(): Promise<Kysely<DB>> {
  // Create a new in-memory PGLite instance with uuid-ossp extension
  pgliteInstance = new PGlite({
    extensions: { uuid_ossp },
  });

  // Read and run the migration file
  const migrationPath = join(__dirname, '../core/internal/db/migrations/init.up.sql');
  const migrationSql = readFileSync(migrationPath, 'utf-8');

  await pgliteInstance.exec(migrationSql);

  // Create Kysely instance with PGLite dialect
  const { dialect } = new KyselyPGlite(pgliteInstance);
  kyselyInstance = new Kysely<DB>({ dialect });

  return kyselyInstance;
}

/**
 * Tears down the test database
 */
export async function teardownTestDatabase(): Promise<void> {
  if (kyselyInstance) {
    try {
      await kyselyInstance.destroy();
    } catch (error) {
      // Silently ignore errors if already closed
    }
    kyselyInstance = null;
  }
  if (pgliteInstance) {
    try {
      // Check if PGlite is not already closed
      if (pgliteInstance.closed === false) {
        await pgliteInstance.close();
      }
    } catch (error) {
      // Silently ignore errors if already closed
    }
    pgliteInstance = null;
  }
  mockDbInstance = null;
}

/**
 * Intercepts the createDbClient function to return the PGLite instance
 * Call this in your test setup before importing the runtime module
 */
export function interceptDbClient(db: Kysely<DB>) {
  // Store the db instance in module scope for the mock
  mockDbInstance = db;

  // Mock the db/client module
  vi.mock('../core/internal/db/client', () => ({
    createDbClient: vi.fn(() => mockDbInstance),
  }));
}

/**
 * Gets the current Kysely instance (useful for direct database operations in tests)
 */
export function getTestDb(): Kysely<DB> {
  if (!kyselyInstance) {
    throw new Error('Test database not initialized. Call setupTestDatabase() first.');
  }
  return kyselyInstance;
}

/**
 * Clears all data from the test database (useful between tests)
 */
export async function clearTestDatabase(db: Kysely<DB>): Promise<void> {
  await db.deleteFrom('messages').execute();
  await db.deleteFrom('operations').execute();
  await db.deleteFrom('state_history').execute();
  await db.deleteFrom('state').execute();
  await db.deleteFrom('runs').execute();
}
