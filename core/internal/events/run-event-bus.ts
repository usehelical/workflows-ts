import { Kysely } from 'kysely';
import { WorkflowStatus } from '../../workflow';
import { EventBus, EventBusCore } from './event-bus-core';
import { PollingLoop } from './polling-loop';
import { getRun } from '../repository/get-run';
import { getRunBatch } from '../repository/get-run-batch';

interface RunEvent {
  status: WorkflowStatus;
  queueName?: string;
  result?: unknown;
  error?: string;
}

type RunEventCallback = (e: RunEvent) => void;

const POLLING_FALLBACK_INTERVAL_MS = 10_000;

export class RunEventBus implements Omit<EventBus, 'emitEvent'> {
  private readonly bus: EventBusCore<RunEvent>;
  private readonly pollingLoop: PollingLoop;

  constructor(private readonly db: Kysely<any>) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'run-event-bus.ts:23',
        message: 'RunEventBus constructor start',
        data: { instanceId: Math.random() },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'B',
      }),
    }).catch(() => {});
    // #endregion
    this.pollingLoop = new PollingLoop(POLLING_FALLBACK_INTERVAL_MS, this.handlePoll.bind(this));
    this.bus = new EventBusCore({ allowWildcardSubscriptions: true }, this.pollingLoop);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'run-event-bus.ts:25',
        message: 'RunEventBus constructor complete',
        data: { hasBus: !!this.bus },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'B',
      }),
    }).catch(() => {});
    // #endregion
    this.pollingLoop.start();
  }

  handleNotify(payload: string) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'run-event-bus.ts:29',
        message: 'handleNotify called',
        data: {
          payload,
          thisContext: this?.constructor?.name,
          hasBus: !!this?.bus,
          hasThis: !!this,
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'A',
      }),
    }).catch(() => {});
    // #endregion
    const [runId, status, changeIdString] = payload.split('::');
    const changeId = Number(changeIdString);
    if (
      !this.bus.checkHasSubscribers(runId, status) ||
      this.bus.getEventSequence(runId, status) >= changeId
    ) {
      return;
    }
    getRun(this.db, runId).then((run) => {
      if (!run) {
        return;
      }
      this.bus.emitEvent(
        runId,
        status,
        {
          status: run.status,
          queueName: run.queueName,
          result: run.output,
          error: run.error,
        },
        changeId,
      );
    });
  }

  private async handlePoll() {
    const workflowIds = [
      ...new Set(this.bus.getSubscriptionKeys().map(([workflowId]) => workflowId)),
    ];
    if (workflowIds.length === 0) {
      return;
    }
    const runs = await getRunBatch(this.db, workflowIds);
    for (const run of runs) {
      this.bus.emitEvent(
        run.id,
        run.status,
        {
          status: run.status,
          queueName: run.queueName,
          result: run.output,
          error: run.error,
        },
        run.changeId,
      );
    }
  }

  subscribe(runId: string, status: WorkflowStatus | '*', cb: RunEventCallback) {
    return this.bus.subscribe(runId, status, cb);
  }

  destroy() {
    this.pollingLoop.stop();
  }
}
