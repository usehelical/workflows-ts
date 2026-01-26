import { Kysely } from 'kysely';
import { EventBus, EventBusCore } from './event-bus-core';
import { PollingLoop } from './polling-loop';

type MessageEvent = undefined;

type MessageCallback = (event: MessageEvent) => void;

const POLLING_FALLBACK_INTERVAL_MS = 10_000;

export class MessageEventBus implements EventBus {
  private readonly bus: EventBusCore<MessageEvent>;
  private readonly pollingLoop: PollingLoop;

  constructor(private readonly db: Kysely<any>) {
    this.pollingLoop = new PollingLoop(POLLING_FALLBACK_INTERVAL_MS, this.handlePoll.bind(this));
    this.bus = new EventBusCore({ allowWildcardSubscriptions: true }, this.pollingLoop);
  }

  handleNotify(payload: string) {
    const [destinationWorkflowId, messageType, messageCount] = payload.split('::');
    if (!this.bus.checkHasSubscribers(destinationWorkflowId, messageType)) {
      return;
    }
    this.bus.emitEvent(destinationWorkflowId, messageType, undefined, Number(messageCount));
  }

  private async handlePoll() {
    // check if there are new messages to be consumed if yes how many?
  }

  subscribe(destinationWorkflowId: string, type: string, cb: MessageCallback) {
    return this.bus.subscribe(destinationWorkflowId, type, cb);
  }

  emitEvent(destinationWorkflowId: string, type: string, count: number) {
    this.bus.emitEvent(destinationWorkflowId, type, undefined, count);
  }

  destroy() {
    this.pollingLoop.stop();
  }
}
