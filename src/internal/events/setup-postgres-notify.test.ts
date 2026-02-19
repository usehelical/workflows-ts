import { describe, it, expect, vi } from 'vitest';
import { setupPostgresNotify } from './setup-postgres-notify';
import { setupIntegrationTest } from '../../test/test-utils';
import { getTestPgLite } from '../../test/test-setup';
import { createPromise } from '../../test/test-helpers';

const { createDriver } = setupIntegrationTest();

describe('setupPostgresNotify', () => {
  it('should receive notification on helical_runs channel', async () => {
    const driver = createDriver();
    const { promise, resolve } = createPromise<string>();
    const runsCallback = vi.fn((payload: string | undefined) => {
      if (payload) resolve(payload);
    });

    const subscriptions = {
      runs: runsCallback,
      messages: vi.fn(),
      state: vi.fn(),
    };

    await setupPostgresNotify(driver.client, subscriptions);

    // Trigger a notification
    const testPayload = 'test-run-id::success::123';
    const pgLite = getTestPgLite();
    await pgLite.query(`SELECT pg_notify('helical_runs', '${testPayload}')`);

    // Wait for callback to be invoked
    const receivedPayload = await promise;

    expect(runsCallback).toHaveBeenCalledWith(testPayload);
    expect(receivedPayload).toBe(testPayload);
  });

  it('should receive notification on helical_messages channel', async () => {
    const driver = createDriver();
    const { promise, resolve } = createPromise<string>();
    const messagesCallback = vi.fn((payload: string | undefined) => {
      if (payload) resolve(payload);
    });

    const subscriptions = {
      runs: vi.fn(),
      messages: messagesCallback,
      state: vi.fn(),
    };

    await setupPostgresNotify(driver.client, subscriptions);

    // Trigger a notification
    const testPayload = 'test-message-id::received::456';
    const pgLite = getTestPgLite();
    await pgLite.query(`SELECT pg_notify('helical_messages', '${testPayload}')`);

    // Wait for callback to be invoked
    const receivedPayload = await promise;

    expect(messagesCallback).toHaveBeenCalledWith(testPayload);
    expect(receivedPayload).toBe(testPayload);
  });

  it('should receive notification on helical_state channel', async () => {
    const driver = createDriver();
    const { promise, resolve } = createPromise<string>();
    const stateCallback = vi.fn((payload: string | undefined) => {
      if (payload) resolve(payload);
    });

    const subscriptions = {
      runs: vi.fn(),
      messages: vi.fn(),
      state: stateCallback,
    };

    await setupPostgresNotify(driver.client, subscriptions);

    // Trigger a notification
    const testPayload = 'test-state-id::updated::789';
    const pgLite = getTestPgLite();
    await pgLite.query(`SELECT pg_notify('helical_state', '${testPayload}')`);

    // Wait for callback to be invoked
    const receivedPayload = await promise;

    expect(stateCallback).toHaveBeenCalledWith(testPayload);
    expect(receivedPayload).toBe(testPayload);
  });

  it('should handle multiple notifications on same channel', async () => {
    const driver = createDriver();
    const receivedPayloads: string[] = [];
    const { promise, resolve } = createPromise<void>();

    const runsCallback = vi.fn((payload: string | undefined) => {
      if (payload) {
        receivedPayloads.push(payload);
        if (receivedPayloads.length === 3) {
          resolve();
        }
      }
    });

    const subscriptions = {
      runs: runsCallback,
      messages: vi.fn(),
      state: vi.fn(),
    };

    await setupPostgresNotify(driver.client, subscriptions);

    // Trigger multiple notifications
    const pgLite = getTestPgLite();
    await pgLite.query(`SELECT pg_notify('helical_runs', 'payload-1::status-1::1')`);
    await pgLite.query(`SELECT pg_notify('helical_runs', 'payload-2::status-2::2')`);
    await pgLite.query(`SELECT pg_notify('helical_runs', 'payload-3::status-3::3')`);

    // Wait for all callbacks
    await promise;

    expect(runsCallback).toHaveBeenCalledTimes(3);
    expect(receivedPayloads).toEqual([
      'payload-1::status-1::1',
      'payload-2::status-2::2',
      'payload-3::status-3::3',
    ]);
  });

  it('should only invoke callback for subscribed channel', async () => {
    const driver = createDriver();
    const { promise, resolve } = createPromise<string>();
    const runsCallback = vi.fn((payload: string | undefined) => {
      if (payload) resolve(payload);
    });
    const messagesCallback = vi.fn();
    const stateCallback = vi.fn();

    const subscriptions = {
      runs: runsCallback,
      messages: messagesCallback,
      state: stateCallback,
    };

    await setupPostgresNotify(driver.client, subscriptions);

    // Only notify helical_runs
    const testPayload = 'test-run::success::999';
    const pgLite = getTestPgLite();
    await pgLite.query(`SELECT pg_notify('helical_runs', '${testPayload}')`);

    // Wait for runs callback
    await promise;

    // Only runs callback should be invoked
    expect(runsCallback).toHaveBeenCalledWith(testPayload);
    expect(messagesCallback).not.toHaveBeenCalled();
    expect(stateCallback).not.toHaveBeenCalled();
  });

  it('should handle notifications on all three channels independently', async () => {
    const driver = createDriver();
    const receivedPayloads: Record<string, string> = {};
    const { promise, resolve } = createPromise<void>();

    const runsCallback = vi.fn((payload: string | undefined) => {
      if (payload) {
        receivedPayloads.runs = payload;
        if (Object.keys(receivedPayloads).length === 3) resolve();
      }
    });

    const messagesCallback = vi.fn((payload: string | undefined) => {
      if (payload) {
        receivedPayloads.messages = payload;
        if (Object.keys(receivedPayloads).length === 3) resolve();
      }
    });

    const stateCallback = vi.fn((payload: string | undefined) => {
      if (payload) {
        receivedPayloads.state = payload;
        if (Object.keys(receivedPayloads).length === 3) resolve();
      }
    });

    const subscriptions = {
      runs: runsCallback,
      messages: messagesCallback,
      state: stateCallback,
    };

    await setupPostgresNotify(driver.client, subscriptions);

    // Trigger notifications on all channels
    const pgLite = getTestPgLite();
    await pgLite.query(`SELECT pg_notify('helical_runs', 'runs-payload')`);
    await pgLite.query(`SELECT pg_notify('helical_messages', 'messages-payload')`);
    await pgLite.query(`SELECT pg_notify('helical_state', 'state-payload')`);

    // Wait for all callbacks
    await promise;

    expect(receivedPayloads).toEqual({
      runs: 'runs-payload',
      messages: 'messages-payload',
      state: 'state-payload',
    });
    expect(runsCallback).toHaveBeenCalledTimes(1);
    expect(messagesCallback).toHaveBeenCalledTimes(1);
    expect(stateCallback).toHaveBeenCalledTimes(1);
  });

  it('should handle empty payload', async () => {
    const driver = createDriver();
    const { promise, resolve } = createPromise<string | undefined>();
    const runsCallback = vi.fn((payload: string | undefined) => {
      resolve(payload);
    });

    const subscriptions = {
      runs: runsCallback,
      messages: vi.fn(),
      state: vi.fn(),
    };

    await setupPostgresNotify(driver.client, subscriptions);

    // Trigger notification with empty payload
    const pgLite = getTestPgLite();
    await pgLite.query(`SELECT pg_notify('helical_runs', '')`);

    // Wait for callback
    const receivedPayload = await promise;

    expect(runsCallback).toHaveBeenCalledWith('');
    expect(receivedPayload).toBe('');
  });
});
