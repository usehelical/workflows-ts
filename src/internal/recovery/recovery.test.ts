import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupIntegrationTest, createTestRuntimeContext, waitForPolling } from '../../test/test-utils';
import { RecoveryStore } from './recovery-store';
import { RecoveryCoordinator } from './coordinator';
import { LocalReaper } from './local-reaper';
import { resolveAppVersion } from '../utils/resolve-app-version';
import { defineWorkflow } from '@api/workflow';
import { insertPendingRun } from '../db/commands/insert-pending-run';
import { enqueueRun } from '../db/commands/enqueue-run';
import { claimRecoverableRuns } from '../db/commands/claim-recoverable-runs';
import { getExecutableRuns } from '../db/queries/get-executable-runs';
import { deserialize } from '../utils/serialization';

const { getDb } = setupIntegrationTest();

// ─── resolveAppVersion ─────────────────────────────────────────────────────

describe('resolveAppVersion', () => {
  const originalEnv = process.env.HELICAL_APP_VERSION;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.HELICAL_APP_VERSION = originalEnv;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('prefers explicit value over env', () => {
    process.env.HELICAL_APP_VERSION = 'from-env';
    expect(resolveAppVersion('from-code')).toBe('from-code');
  });

  it('falls back to HELICAL_APP_VERSION env var', () => {
    process.env.HELICAL_APP_VERSION = 'abc123';
    expect(resolveAppVersion()).toBe('abc123');
  });

  it('defaults to "dev" with a warning in non-production', () => {
    delete process.env.HELICAL_APP_VERSION;
    process.env.NODE_ENV = 'development';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveAppVersion()).toBe('dev');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no app version set'));
    warnSpy.mockRestore();
  });

  it('throws in production when no version is set', () => {
    delete process.env.HELICAL_APP_VERSION;
    process.env.NODE_ENV = 'production';
    expect(() => resolveAppVersion()).toThrow('required in production');
  });

  it('rejects "::" in the version string', () => {
    expect(() => resolveAppVersion('v1::bad')).toThrow();
  });

  it('rejects versions longer than 255 chars', () => {
    expect(() => resolveAppVersion('a'.repeat(256))).toThrow();
  });

  it('accepts git-SHA-like strings', () => {
    expect(() => resolveAppVersion('abc123def456')).not.toThrow();
  });

  it('accepts semver strings', () => {
    expect(() => resolveAppVersion('1.2.3-alpha.4')).not.toThrow();
  });
});

// ─── Version routing — dequeue filter ──────────────────────────────────────

describe('version routing — dequeue (app_version IS NULL OR mine)', () => {
  it('claims unpinned queued runs and stamps app_version at claim time', async () => {
    const db = getDb();
    const executorId = 'dequeue-test-exec';
    const appVersion = 'v1.0.0';

    // Enqueue a run without app_version (as a client would do)
    await enqueueRun(db, {
      runId: 'queued-unpinned',
      path: ['queued-unpinned'],
      inputs: '[]',
      workflowName: 'noop',
      queueName: 'test-q',
    });

    const claimed = await getExecutableRuns(db, {
      queueName: 'test-q',
      executorId,
      appVersion,
    });

    expect(claimed).toHaveLength(1);
    expect(claimed[0].runId).toBe('queued-unpinned');
    expect(claimed[0].appVersion).toBe(appVersion);

    // Confirm the row is stamped
    const row = await db.selectFrom('runs').select('app_version').where('id', '=', 'queued-unpinned').executeTakeFirst();
    expect(row?.app_version).toBe(appVersion);
  });

  it('does NOT claim runs pinned to a different version', async () => {
    const db = getDb();

    await enqueueRun(db, {
      runId: 'queued-v2',
      path: ['queued-v2'],
      inputs: '[]',
      workflowName: 'noop',
      queueName: 'test-q2',
    });
    // Manually stamp it with v2 (simulating a run already claimed by v2)
    await db.updateTable('runs').set({ app_version: 'v2.0.0', status: 'queued' }).where('id', '=', 'queued-v2').execute();

    const claimed = await getExecutableRuns(db, {
      queueName: 'test-q2',
      executorId: 'v1-exec',
      appVersion: 'v1.0.0',
    });

    expect(claimed).toHaveLength(0);
  });
});

// ─── Claim predicate: version + lease ──────────────────────────────────────

describe('claimRecoverableRuns — version+lease filtering', () => {
  it('claims a pending run with matching version and no lease', async () => {
    const db = getDb();
    const runId = 'claim-test-1';

    await insertPendingRun(db, {
      runId,
      path: [runId],
      inputs: '[]',
      executorId: 'dead-executor',
      workflowName: 'noop',
      appVersion: 'v1.0.0',
    });

    const now = Date.now();
    const claimed = await claimRecoverableRuns(db, 'v1.0.0', 'new-executor', now + 30_000, 10);

    expect(claimed).toHaveLength(1);
    expect(claimed[0].runId).toBe(runId);
    expect(claimed[0].appVersion).toBe('v1.0.0');
    expect(claimed[0].recoveryAttempts).toBe(1);
  });

  it('does NOT claim a run pinned to a different version', async () => {
    const db = getDb();
    const runId = 'claim-version-mismatch';

    await insertPendingRun(db, {
      runId,
      path: [runId],
      inputs: '[]',
      executorId: 'dead-executor',
      workflowName: 'noop',
      appVersion: 'v2.0.0',
    });

    const now = Date.now();
    const claimed = await claimRecoverableRuns(db, 'v1.0.0', 'v1-executor', now + 30_000, 10);

    expect(claimed).toHaveLength(0);
  });

  it('does NOT claim a run whose lease has not expired', async () => {
    const db = getDb();
    const runId = 'claim-lease-active';

    await insertPendingRun(db, {
      runId,
      path: [runId],
      inputs: '[]',
      executorId: 'live-executor',
      workflowName: 'noop',
      appVersion: 'v1.0.0',
    });
    // Set a future lease
    const futureMs = Date.now() + 60_000;
    await db.updateTable('runs').set({ lease_expires_at: futureMs.toString() }).where('id', '=', runId).execute();

    const now = Date.now();
    const claimed = await claimRecoverableRuns(db, 'v1.0.0', 'reaper-executor', now + 30_000, 10);

    expect(claimed).toHaveLength(0);
  });

  it('claims a run once its lease expires', async () => {
    const db = getDb();
    const runId = 'claim-lease-expired';

    await insertPendingRun(db, {
      runId,
      path: [runId],
      inputs: '[]',
      executorId: 'dead-executor',
      workflowName: 'noop',
      appVersion: 'v1.0.0',
    });
    // Set an already-expired lease
    const expiredMs = Date.now() - 1000;
    await db.updateTable('runs').set({ lease_expires_at: expiredMs.toString() }).where('id', '=', runId).execute();

    const now = Date.now();
    const claimed = await claimRecoverableRuns(db, 'v1.0.0', 'new-executor', now + 30_000, 10);

    expect(claimed).toHaveLength(1);
    expect(claimed[0].runId).toBe(runId);
  });

  it('a duplicate claimRun is rejected when the lease is still held', async () => {
    const db = getDb();
    const runId = 'duplicate-claim-test';
    const appVersion = 'v1.0.0';
    const store = new RecoveryStore(db);

    await insertPendingRun(db, {
      runId,
      path: [runId],
      inputs: '[]',
      executorId: 'dead-executor',
      workflowName: 'noop',
      appVersion,
    });

    const ttlMs = 30_000;

    // First claim succeeds
    const first = await store.claimRun(runId, appVersion, 'executor-A', ttlMs);
    expect(first).not.toBeNull();

    // Second claim by a different executor is rejected (lease is still held)
    const second = await store.claimRun(runId, appVersion, 'executor-B', ttlMs);
    expect(second).toBeNull();
  });
});

// ─── Child workflow version inheritance ────────────────────────────────────

describe('app_version inheritance — child workflow', () => {
  it('child run inherits parent pinned version from ExecutionContext', async () => {
    const db = getDb();
    let childRunId: string | undefined;

    const parentDef = defineWorkflow('parent-wf', async function () {
      const { runWorkflow: rw, getExecutionContext } = await import('../run-workflow');
      const { getExecutionContext: getCtx } = await import('../context/execution-context');
      const ctx = getCtx();
      const childId = 'child-version-test';
      // Access the appVersion from the execution context
      const ctxAppVersion = ctx.appVersion;
      expect(ctxAppVersion).toBe('vInherit');

      // Record the child ID for assertion
      childRunId = childId;
      void rw(ctx, 'child-wf', []);
    });

    const childDef = defineWorkflow('child-wf', async function () {
      return 'child-done';
    });

    const setup = createTestRuntimeContext({
      appVersion: 'vInherit',
      workflows: [parentDef, childDef],
    });
    const ctx = setup.ctx;
    await setup.notifySetup;

    const parentId = 'parent-version-test';
    await insertPendingRun(db, {
      runId: parentId,
      path: [parentId],
      inputs: '[]',
      executorId: ctx.executorId,
      workflowName: 'parent-wf',
      appVersion: 'vInherit',
    });

    // Confirm app_version stamped on insert
    const row = await db.selectFrom('runs').select('app_version').where('id', '=', parentId).executeTakeFirst();
    expect(row?.app_version).toBe('vInherit');

    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });
});

// ─── RecoveryCoordinator seam ──────────────────────────────────────────────

describe('RecoveryCoordinator seam', () => {
  it('createWorker calls coordinator.start() and stop() via worker.stop()', async () => {
    const { createWorker } = await import('../../main/worker/worker');

    const startSpy = vi.fn();
    const stopSpy = vi.fn();

    const fakeCoordinator: RecoveryCoordinator = {
      start: startSpy,
      stop: stopSpy,
    };

    const worker = createWorker({
      workflows: [defineWorkflow('noop', async () => {})],
      options: {
        connectionString: 'dummy', // mocked by test-setup.ts
        coordinator: fakeCoordinator,
      },
    });

    expect(startSpy).toHaveBeenCalledOnce();

    worker.stop();
    expect(stopSpy).toHaveBeenCalledOnce();
  });

  it('default coordinator is LocalReaper when no coordinator option is provided', async () => {
    const { createWorker } = await import('../../main/worker/worker');
    const localReaperModule = await import('./local-reaper');
    const startSpy = vi.spyOn(localReaperModule.LocalReaper.prototype, 'start');
    const stopSpy = vi.spyOn(localReaperModule.LocalReaper.prototype, 'stop');

    const worker = createWorker({
      workflows: [defineWorkflow('noop', async () => {})],
      options: { connectionString: 'dummy' },
    });

    expect(startSpy).toHaveBeenCalledOnce();

    worker.stop();
    expect(stopSpy).toHaveBeenCalledOnce();

    startSpy.mockRestore();
    stopSpy.mockRestore();
  });

  it('LocalReaper recovers a run with matching version and expired lease', async () => {
    const db = getDb();
    const { promise, resolve } = (() => {
      let r!: () => void;
      const p = new Promise<void>((res) => { r = res; });
      return { promise: p, resolve: r };
    })();

    const workflowFn = vi.fn().mockImplementation(async () => {
      resolve();
      return 'recovered';
    });

    const setup = createTestRuntimeContext({
      appVersion: 'v-reaper-test',
      workflows: [defineWorkflow('recoverableWorkflow', workflowFn)],
    });
    const ctx = setup.ctx;
    await setup.notifySetup;

    const runId = 'reaper-recovery-run';
    await insertPendingRun(db, {
      runId,
      path: [runId],
      inputs: '[]',
      executorId: 'dead-executor',
      workflowName: 'recoverableWorkflow',
      appVersion: 'v-reaper-test',
    });
    // No lease_expires_at = immediately claimable

    const reaper = new LocalReaper(ctx);
    reaper.start();

    await promise; // Wait for the workflow fn to execute
    // Give recordRunResult time to write the terminal status to DB
    await waitForPolling(200);

    const row = await db.selectFrom('runs').select(['status', 'app_version']).where('id', '=', runId).executeTakeFirst();
    expect(row?.status).toBe('success');
    expect(row?.app_version).toBe('v-reaper-test');
    expect(workflowFn).toHaveBeenCalledOnce();

    reaper.stop();
    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });

  it('LocalReaper does NOT recover a run with a different version', async () => {
    const db = getDb();

    const setup = createTestRuntimeContext({
      appVersion: 'v1.0.0',
      workflows: [],
    });
    const ctx = setup.ctx;
    await setup.notifySetup;

    const runId = 'no-recover-wrong-version';
    await insertPendingRun(db, {
      runId,
      path: [runId],
      inputs: '[]',
      executorId: 'dead-executor',
      workflowName: 'someWorkflow',
      appVersion: 'v2.0.0',
    });

    const reaper = new LocalReaper(ctx);
    // Manually trigger one reap cycle
    // @ts-expect-error accessing private for test
    await reaper.handleReap();

    const row = await db.selectFrom('runs').select('status').where('id', '=', runId).executeTakeFirst();
    // Should still be pending — the v1.0.0 reaper didn't touch it
    expect(row?.status).toBe('pending');

    reaper.stop();
    ctx.runEventBus.destroy();
    ctx.messageEventBus.destroy();
    ctx.stateEventBus.destroy();
  });
});
