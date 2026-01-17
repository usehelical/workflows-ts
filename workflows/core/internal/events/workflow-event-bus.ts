import { Kysely } from 'kysely';
import { WorkflowStatus } from '../../workflow';

import { Repository } from '../../repository';

import { EventBus, EventBusCore } from './event-bus-core';
import { PollingLoop } from './polling-loop';

interface WorkflowEvent {
  status: WorkflowStatus;
  queueName?: string;
  result?: unknown;
  error?: string;
}

type WorkflowEventCallback = (e: WorkflowEvent) => void;

const POLLING_FALLBACK_INTERVAL_MS = 10_000;

export class WorkflowEventBus implements EventBus {
  private readonly bus: EventBusCore<WorkflowEvent>;
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
    this.repository.getWorkflow(this.db, workflowId).then((workflow) => {
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
    const workflows = await this.repository.getMultipleWorkflows(this.db, workflowIds);
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

  subscribe(workflowId: string, status: WorkflowStatus | '*', cb: WorkflowEventCallback) {
    return this.bus.subscribe(workflowId, status, cb);
  }

  emitEvent(workflowId: string, status: WorkflowStatus, event: WorkflowEvent, changeId: number) {
    this.bus.emitEvent(workflowId, status, event, changeId);
  }

  destroy() {
    this.pollingLoop.stop();
  }
}
