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
import { DbDriver } from '../core/internal/db/driver-pg';
import { RuntimeContext } from '../core/internal/context/runtime-context';
import { MessageEventBus } from '../core/internal/events/message-event-bus';
import { StateEventBus } from '../core/internal/events/state-event-bus';
import { RunEventBus } from '../core/internal/events/run-event-bus';
import { RunRegistry } from '../core/internal/context/run-registry';
import { WorkflowRegistry } from '../core/internal/context/workflow-registry';
import { QueueRegistry } from '../core/internal/context/queue-registry';
import { WorkflowEntry } from '../core/workflow';
import { QueueEntry } from '../core/queue';
import { setupPostgresNotify } from '../core/internal/events/setup-postgres-notify';
import crypto from 'node:crypto';

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

/**
 * Creates a RuntimeContext for tests with PostgreSQL NOTIFY support, matching production setup.
 *
 * @param options - Optional configuration
 * @param options.executorId - Specific executor ID (defaults to unique ID per test)
 * @param options.workflows - Workflow registry entries
 * @param options.queues - Queue registry entries
 * @returns RuntimeContext and setup promise (like production)
 */
export function createTestRuntimeContext(
  options: {
    executorId?: string;
    workflows?: Record<string, WorkflowEntry>;
    queues?: Record<string, QueueEntry>;
  } = {},
): { ctx: RuntimeContext; notifySetup: Promise<void> } {
  const driver = createTestDriver();
  const db = driver.db;
  const client = driver.client;

  const executorId = options.executorId ?? `test-executor-${crypto.randomUUID()}`;
  const messageEventBus = new MessageEventBus(db);
  const stateEventBus = new StateEventBus(db);
  const runEventBus = new RunEventBus(db);
  const runRegistry = new RunRegistry();
  const workflowRegistry = new WorkflowRegistry(options.workflows || {});
  const queueRegistry = new QueueRegistry(options.queues || {});

  const ctx: RuntimeContext = {
    db,
    executorId,
    messageEventBus,
    stateEventBus,
    runEventBus,
    runRegistry,
    workflowRegistry,
    queueRegistry,
  };

  // Set up PostgreSQL NOTIFY using the same function as production
  const notifySetupPromise = setupPostgresNotify(client, {
    runs: runEventBus.handleNotify.bind(runEventBus),
    state: stateEventBus.handleNotify.bind(stateEventBus),
    messages: messageEventBus.handleNotify.bind(messageEventBus),
  });

  return {
    ctx,
    notifySetup: notifySetupPromise,
  };
}

/**
 * Helper to wait for database events to propagate through NOTIFY/polling.
 * With NOTIFY enabled, events are typically received within ~50ms.
 * Polling fallback runs every 100ms as backup.
 */
export async function waitForPolling(ms: number = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
