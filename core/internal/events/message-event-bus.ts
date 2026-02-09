import { EventBus, EventBusCore } from './event-bus-core';
import { PollingLoop } from './polling-loop';
import { Database } from '../db/db';
import { getMessageBatch } from '../repository/get-message-batch';
import { withDbRetry } from '../db/retry';

type MessageEvent = undefined;

type MessageCallback = (event: MessageEvent) => void;

const POLLING_FALLBACK_INTERVAL_MS = 10_000;

export class MessageEventBus implements Omit<EventBus, 'emitEvent'> {
  private readonly bus: EventBusCore<MessageEvent>;
  private readonly pollingLoop: PollingLoop;

  constructor(
    private readonly db: Database,
    pollingFallbackIntervalMs: number = POLLING_FALLBACK_INTERVAL_MS,
  ) {
    this.pollingLoop = new PollingLoop(pollingFallbackIntervalMs, this.handlePoll.bind(this));
    this.bus = new EventBusCore({ allowWildcardSubscriptions: true }, this.pollingLoop);
    this.pollingLoop.start();
  }

  handleNotify(payload: string) {
    const [destinationWorkflowId, messageType, messageCount] = payload.split('::');
    if (!this.bus.checkHasSubscribers(destinationWorkflowId, messageType)) {
      return;
    }
    this.bus.emitEvent(destinationWorkflowId, messageType, undefined, Number(messageCount));
  }

  private async handlePoll() {
    const messageRetrievalRequests = getMessageRetrievalRequests(this.bus.getSubscriptionKeys());
    if (messageRetrievalRequests.length === 0) {
      return;
    }
    try {
      const messages = await withDbRetry(
        async () => await getMessageBatch(this.db, messageRetrievalRequests),
      );
      for (const message of messages) {
        this.bus.emitEvent(message.destinationRunId, message.type, undefined, 1);
      }
    } catch (error) {
      console.error('Error polling messages:', error);
    }
  }

  subscribe(destinationWorkflowId: string, type: string, cb: MessageCallback) {
    return this.bus.subscribe(destinationWorkflowId, type, cb);
  }

  destroy() {
    this.pollingLoop.stop();
  }
}

function getMessageRetrievalRequests(subscriptionKeys: string[][]) {
  return subscriptionKeys.map(([destinationWorkflowId, messageType]) => ({
    destinationWorkflowId,
    messageType,
  }));
}

export type MessageRetrievalRequest = ReturnType<typeof getMessageRetrievalRequests>;
