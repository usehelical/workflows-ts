import { RunStatus } from '../../workflow';
import { EventBus, EventBusCore } from './event-bus-core';
import { PollingLoop } from './polling-loop';
import { getRun } from '../repository/get-run';
import { getRunBatch } from '../repository/get-run-batch';
import { Database } from '../db/db';
import { withDbRetry } from '../db/retry';

interface RunEvent {
  status: RunStatus;
  queueName?: string;
  result?: unknown;
  error?: string;
}

type RunEventCallback = (e: RunEvent) => void;

const POLLING_FALLBACK_INTERVAL_MS = 100; // Changed from 10_000 for testing

export class RunEventBus implements Omit<EventBus, 'emitEvent'> {
  private readonly bus: EventBusCore<RunEvent>;
  private readonly pollingLoop: PollingLoop;

  constructor(
    private readonly db: Database,
    pollingFallbackIntervalMs: number = POLLING_FALLBACK_INTERVAL_MS,
  ) {
    this.pollingLoop = new PollingLoop(pollingFallbackIntervalMs, this.handlePoll.bind(this));
    this.bus = new EventBusCore({ allowWildcardSubscriptions: true }, this.pollingLoop);
    this.pollingLoop.start();
  }

  async handleNotify(payload: string) {
    const [runId, status, changeIdString] = payload.split('::');
    const changeId = Number(changeIdString);
    if (
      !this.bus.checkHasSubscribers(runId, status) ||
      this.bus.getEventSequence(runId, status) >= changeId
    ) {
      return;
    }
    try {
      const run = await withDbRetry(async () => await getRun(this.db, runId));
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
    } catch (error) {
      console.error('Error handling notify for run:', error);
      return;
    }
  }

  private async handlePoll() {
    const workflowIds = [
      ...new Set(this.bus.getSubscriptionKeys().map(([workflowId]) => workflowId)),
    ];
    if (workflowIds.length === 0) {
      return;
    }
    try {
      const runs = await withDbRetry(async () => await getRunBatch(this.db, workflowIds));
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
    } catch (error) {
      console.error('Error polling runs:', error);
    }
  }

  subscribe(runId: string, status: RunStatus | '*', cb: RunEventCallback) {
    return this.bus.subscribe(runId, status, cb);
  }

  destroy() {
    this.pollingLoop.stop();
  }
}
