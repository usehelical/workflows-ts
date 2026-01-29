import { WorkflowStatus } from '../../workflow';
import { EventBus, EventBusCore } from './event-bus-core';
import { PollingLoop } from './polling-loop';
import { getRun } from '../repository/get-run';
import { getRunBatch } from '../repository/get-run-batch';
import { Database } from '../db/db';

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

  constructor(private readonly db: Database) {
    this.pollingLoop = new PollingLoop(POLLING_FALLBACK_INTERVAL_MS, this.handlePoll.bind(this));
    this.bus = new EventBusCore({ allowWildcardSubscriptions: true }, this.pollingLoop);
    this.pollingLoop.start();
  }

  handleNotify(payload: string) {
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
