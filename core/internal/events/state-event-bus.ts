import { PollingLoop } from './polling-loop';
import { EventBus, EventBusCore } from './event-bus-core';
import { getState } from '../repository/get-state';
import { Database } from '../db/db';

type SubscriptionCallback<T> = (data: T) => void;

const POLLING_FALLBACK_INTERVAL_MS = 10_000;

type StateEvent = unknown;

export class StateEventBus implements EventBus {
  private readonly bus: EventBusCore<StateEvent>;
  private readonly pollingLoop: PollingLoop;

  constructor(private readonly db: Database) {
    this.pollingLoop = new PollingLoop(POLLING_FALLBACK_INTERVAL_MS, this.handlePoll.bind(this));
    this.bus = new EventBusCore({ allowWildcardSubscriptions: false }, this.pollingLoop);
    this.pollingLoop.start();
  }

  handleNotify(payload: string) {
    const [workflowId, key, changeIdString] = payload.split('::');
    const changeId = Number(changeIdString);
    if (
      !this.bus.checkHasSubscribers(workflowId, key) ||
      this.bus.getEventSequence(workflowId, key) >= changeId
    ) {
      return;
    }
    getState(this.db, workflowId, key).then((state) => {
      if (!state) {
        return;
      }
      this.bus.emitEvent(workflowId, key, state, changeId);
    });
  }

  private async handlePoll() {
    const stateRetrievalRequests = getStateRetrievalRequests(this.bus.getSubscriptionKeys());
    if (stateRetrievalRequests.length === 0) {
      return;
    }
    // const states = []
    // for (const state of states) {
    //   this.bus.emitEvent(state.runId, state.key, state.data, state.changeId);
    // }
  }

  subscribe<T>(workflowId: string, key: string, callback: SubscriptionCallback<T>) {
    return this.bus.subscribe(workflowId, key, callback as SubscriptionCallback<unknown>);
  }

  emitEvent<T>(workflowId: string, key: string, data: T, changeId: number) {
    this.bus.emitEvent(workflowId, key, data, changeId);
  }

  destroy() {
    this.pollingLoop.stop();
  }
}

function getStateRetrievalRequests(keys: string[][]) {
  return keys.map((k) => {
    const [runId, key] = k;
    return {
      runId,
      key,
    };
  });
}
