# Test Setup with PGLite

This directory contains test infrastructure for running integration tests using PGLite, an in-memory PostgreSQL implementation.

## Overview

The test setup automatically:

1. Creates an in-memory PGLite database with the uuid-ossp extension
2. Runs the production migrations from `core/internal/db/migrations/init.up.sql`
3. Intercepts the `createDbClient` function to inject the PGLite instance
4. Provides utilities for test isolation and database cleanup

## Requirements

The test setup requires the PGLite uuid-ossp extension, which is already configured in `package.json`:

```json
"uuid_ossp": "link:@electric-sql/pglite/contrib/uuid_ossp"
```

## Usage

### Recommended: Using `setupIntegrationTest()` Helper

The easiest way to set up integration tests is using the `setupIntegrationTest()` helper from `test-utils.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { setupIntegrationTest } from '../client/test-utils';

// This single line sets up everything!
const { getDb } = setupIntegrationTest();

describe('My Integration Test', () => {
  it('should work with the database', async () => {
    const db = getDb();

    // Your test code here
    const runs = await db.selectFrom('runs').selectAll().execute();
    expect(runs).toEqual([]);
  });
});
```

This automatically:

- ✅ Creates PGLite instance and runs migrations (`beforeAll`)
- ✅ Intercepts `createDbClient` to use PGLite
- ✅ Clears database between tests (`beforeEach`)
- ✅ Tears down connections (`afterAll`)

### Manual Setup (Advanced)

If you need more control, you can use the low-level functions directly:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase,
  teardownTestDatabase,
  interceptDbClient,
  clearTestDatabase,
} from './test-setup';
import { Kysely } from 'kysely';
import { DB } from '../core/internal/db/types';

let testDb: Kysely<DB>;

beforeAll(async () => {
  // Creates PGLite instance and runs migrations
  testDb = await setupTestDatabase();

  // Intercepts createDbClient to use PGLite
  interceptDbClient(testDb);
});

afterAll(async () => {
  // Cleanup and close connections
  await teardownTestDatabase();
});

beforeEach(async () => {
  // Clear all data between tests for isolation
  await clearTestDatabase(testDb);
});
```

### Writing Tests

```typescript
describe('My Integration Test', () => {
  it('should test workflow functionality', async () => {
    const { createInstance } = await import('./runtime');
    const { defineWorkflow } = await import('../core/workflow');

    // Define your workflow
    const myWorkflow = defineWorkflow(async (input: string) => {
      return `Processed: ${input}`;
    });

    // Create instance (will use PGLite automatically)
    const instance = createInstance({}, [], { connectionString: 'dummy' });

    // Test your workflow
    await instance.startWorkflow(myWorkflow('test'));

    // Verify database state
    const runs = await testDb.selectFrom('runs').selectAll().execute();
    expect(runs).toHaveLength(1);
  });
});
```

### Direct Database Access

You can also access the database directly for setup, assertions, or testing repository code:

```typescript
it('should test database operations', async () => {
  // Insert test data
  await testDb
    .insertInto('runs')
    .values({
      workflow_name: 'test-workflow',
      status: 'pending',
    })
    .execute();

  // Query and assert
  const runs = await testDb.selectFrom('runs').selectAll().execute();

  expect(runs[0].workflow_name).toBe('test-workflow');
});
```

## API Reference

### High-Level API (Recommended)

#### `setupIntegrationTest(): { getDb: () => Kysely<DB> }`

**From:** `test-utils.ts`

Sets up and tears down the test database automatically. Returns an object with a `getDb()` function to access the database instance.

**Usage:**

```typescript
const { getDb } = setupIntegrationTest();

// In your tests:
const db = getDb();
```

This is the recommended way to set up integration tests as it handles all setup/teardown automatically.

### Low-Level API

#### `setupTestDatabase(): Promise<Kysely<DB>>`

Creates a new PGLite instance, runs migrations, and returns a Kysely client.

#### `teardownTestDatabase(): Promise<void>`

Closes all database connections and cleans up resources.

#### `interceptDbClient(db: Kysely<DB>): void`

Mocks the `createDbClient` function to return the provided database instance.
Must be called before importing modules that use `createDbClient`.

#### `clearTestDatabase(db: Kysely<DB>): Promise<void>`

Deletes all data from all tables. Useful in `beforeEach` hooks for test isolation.

#### `getTestDb(): Kysely<DB>`

Returns the current test database instance. Throws if `setupTestDatabase()` hasn't been called.

## Best Practices

1. **Test Isolation**: Always use `clearTestDatabase()` in `beforeEach` to ensure tests don't affect each other
2. **Import Order**: Call `interceptDbClient()` before importing any modules that use `createDbClient`
3. **Cleanup**: Always call `teardownTestDatabase()` in `afterAll` to prevent memory leaks
4. **Dynamic Imports**: Use dynamic imports (`await import()`) after setting up the interceptor

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run specific test file
pnpm test runtime.test.ts
```

## Troubleshooting

### "Test database not initialized" error

Make sure you call `setupTestDatabase()` in `beforeAll` before using the database.

### Migrations don't run

Check that the migration file path in `test-setup.ts` is correct relative to the test file location.

### Tests interfere with each other

Make sure you're calling `clearTestDatabase()` in `beforeEach` to reset state between tests.
