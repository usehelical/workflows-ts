import { Kysely } from 'kysely';

export interface MessageEvent {
  messageId: string;
  destinationWorkflowId: string;
  type: string;
  payload: unknown;
}

type MessageCallback = (event: MessageEvent) => void;

const DEDUP_WINDOW_MS = 1000;
const WILDCARD_TYPE = '__ALL__';
const POLL_INTERVAL_MS = 10_000; // 10 seconds

export class MessageEventBus {
  private readonly subscribers: Map<string, Set<MessageCallback>> = new Map();
  private readonly processedMessages = new Map<string, NodeJS.Timeout>();
  private readonly pollState = {
    lastPolledAt: new Date(0),
    intervalHandle: null as NodeJS.Timeout | null,
    isPolling: false,
  };

  constructor(private readonly db: Kysely<any>) {}

  subscribe(workflowId: string, messageType: string | null, callback: MessageCallback) {
    const key = this.makeSubscriptionKey(workflowId, messageType);

    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);

    // Start polling if this is our first subscriber
    this.ensurePollingStarted();

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(key);
        }
      }

      // Stop polling if no more subscribers
      this.checkStopPolling();
    };
  }

  async consumeMessage(messageId: string) {
    return await this.db.deleteFrom('messages').where('id', '=', messageId).execute();
  }

  emitMessageEvent(event: MessageEvent) {
    // if no subscriber return
    this.deliverToSubscribers(event);

    if (!this.hasSubscribersFor(event.destinationWorkflowId, event.type)) {
      return;
    }

    this.addToDeduplicationCache(event.messageId);
  }

  handleNotification(notification: string) {
    const [workflowId, messageType, messageId] = notification.split('::');

    if (this.processedMessages.has(messageId)) {
      return;
    }

    // query the database for the message
  }

  private hasSubscribersFor(workflowId: string, messageType: string): boolean {
    const exactKey = this.makeSubscriptionKey(workflowId, messageType);
    const wildcardKey = this.makeSubscriptionKey(workflowId, null);

    const hasExact = this.subscribers.has(exactKey) && this.subscribers.get(exactKey)!.size > 0;
    const hasWildcard =
      this.subscribers.has(wildcardKey) && this.subscribers.get(wildcardKey)!.size > 0;

    return hasExact || hasWildcard;
  }

  private makeSubscriptionKey(workflowId: string, messageType: string | null): string {
    return `${workflowId}::${messageType ?? WILDCARD_TYPE}`;
  }

  addToDeduplicationCache(messageId: string) {
    const timeout = setTimeout(() => {
      this.processedMessages.delete(messageId);
    }, DEDUP_WINDOW_MS);
    this.processedMessages.set(messageId, timeout);
  }

  deliverToSubscribers(event: MessageEvent) {
    // Deliver to exact type subscribers
    const exactKey = this.makeSubscriptionKey(event.destinationWorkflowId, event.type);
    const exactSubscribers = this.subscribers.get(exactKey);
    if (exactSubscribers) {
      for (const callback of exactSubscribers) {
        callback(event);
      }
    }

    // Deliver to wildcard subscribers (null messageType)
    const wildcardKey = this.makeSubscriptionKey(event.destinationWorkflowId, null);
    const wildcardSubscribers = this.subscribers.get(wildcardKey);
    if (wildcardSubscribers) {
      for (const callback of wildcardSubscribers) {
        callback(event);
      }
    }
  }

  private ensurePollingStarted() {
    if (!this.pollState.isPolling && this.subscribers.size > 0) {
      this.pollState.isPolling = true;
      this.startPolling();
    }
  }

  private checkStopPolling() {
    if (this.pollState.isPolling && this.subscribers.size === 0) {
      this.stopPolling();
    }
  }

  private startPolling() {
    // Run immediately
    this.pollForMessages().catch((err) => {
      console.error('Initial poll failed:', err);
    });

    // Then run every 10 seconds
    this.pollState.intervalHandle = setInterval(() => {
      this.pollForMessages().catch((err) => {
        console.error('Error polling for messages:', err);
      });
    }, POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (this.pollState.intervalHandle) {
      clearInterval(this.pollState.intervalHandle);
      this.pollState.intervalHandle = null;
      this.pollState.isPolling = false;
    }
  }

  private async pollForMessages() {
    const workflowIds = this.getSubscribedWorkflowIds();

    if (workflowIds.length === 0) return;

    const messages = await this.db
      .selectFrom('messages')
      .selectAll()
      .where('destination_workflow_id', 'in', workflowIds)
      .where('created_at', '>', this.pollState.lastPolledAt)
      .orderBy('created_at', 'asc')
      .limit(100)
      .execute();

    this.pollState.lastPolledAt = new Date();

    for (const message of messages) {
      if (this.processedMessages.has(message.id)) continue;

      const event = this.messageToEvent(message);
      if (this.hasSubscribersFor(event.destinationWorkflowId, event.type)) {
        this.deliverToSubscribers(event);
        this.addToDeduplicationCache(event.messageId);
      }
    }
  }

  private getSubscribedWorkflowIds(): string[] {
    const workflowIds = new Set<string>();
    for (const key of this.subscribers.keys()) {
      const [workflowId] = key.split('::');
      workflowIds.add(workflowId);
    }
    return Array.from(workflowIds);
  }

  private messageToEvent(message: any): MessageEvent {
    return {
      messageId: message.id,
      destinationWorkflowId: message.destination_workflow_id,
      type: message.type,
      payload: JSON.parse(message.payload),
    };
  }

  destroy() {
    // Stop polling
    this.stopPolling();

    // Clean up deduplication cache
    for (const timeout of this.processedMessages.values()) {
      clearTimeout(timeout);
    }
    this.processedMessages.clear();
    this.subscribers.clear();
  }
}
