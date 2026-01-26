import { Kysely } from 'kysely';
import { WorkflowStatus } from '../../workflow';

import { Repository } from '../repository/repository';

import { EventBus, EventBusCore } from './event-bus-core';
import { PollingLoop } from './polling-loop';

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

  constructor(
    private readonly db: Kysely<any>,
    private readonly repository: Repository,
  ) {
    this.pollingLoop = new PollingLoop(POLLING_FALLBACK_INTERVAL_MS, this.handlePoll.bind(this));
    this.bus = new EventBusCore({ allowWildcardSubscriptions: true }, this.pollingLoop);
  }

  handleNotify(payload: string) {
    const [workflowId, status, changeIdString] = payload.split('::');
    const changeId = Number(changeIdString);
    if (
      !this.bus.checkHasSubscribers(workflowId, status) ||
      this.bus.getEventSequence(workflowId, status) >= changeId
    ) {
      return;
    }
    this.repository.getRun(this.db, workflowId).then((workflow) => {
      if (!workflow) {
        return;
      }
      this.bus.emitEvent(
        workflowId,
        status,
        {
          status: workflow.status,
          queueName: workflow.queueName,
          result: workflow.output,
          error: workflow.error,
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
    const workflows = await this.repository.getMultipleRuns(this.db, workflowIds);
    for (const workflow of workflows) {
      this.bus.emitEvent(
        workflow.id,
        workflow.status,
        {
          status: workflow.status,
          queueName: workflow.queueName,
          result: workflow.output,
          error: workflow.error,
        },
        workflow.changeId,
      );
    }
  }

  subscribe(runId: string, status: WorkflowStatus | '*', cb: RunEventCallback) {
    return this.bus.subscribe(runId, status, cb);
  }

  emitEvent(runId: string, status: WorkflowStatus, event: RunEvent, changeId: number) {
    this.bus.emitEvent(runId, status, event, changeId);
  }

  destroy() {
    this.pollingLoop.stop();
  }
}
