import { PollingLoop } from './polling-loop';

export type SubscriptionCallback<T> = (data: T) => void;

export type Wildcard = '*';

type EventBusCoreConfig = {
  allowWildcardSubscriptions: boolean;
};

export interface EventBus {
  handleNotify: (payload: string) => void;
  subscribe: CallableFunction;
  emitEvent: CallableFunction;
  destroy: () => void;
}

export class EventBusCore<TEvent> {
  private readonly subscribers: Map<string, Set<SubscriptionCallback<TEvent>>> = new Map();
  private readonly eventSequence = new Map<string, number>();
  private readonly pollingLoop: PollingLoop;
  private readonly allowWildcardSubscriptions: boolean;

  constructor(
    private readonly config: EventBusCoreConfig,
    pollingLoop: PollingLoop,
  ) {
    this.allowWildcardSubscriptions = config.allowWildcardSubscriptions;
    this.pollingLoop = pollingLoop;
  }

  subscribe(subject: string, key: string | '*', callback: SubscriptionCallback<TEvent>) {
    const subscriptionKey = createSubscriptionKey(subject, key);
    if (!this.subscribers.has(subscriptionKey)) {
      this.subscribers.set(subscriptionKey, new Set());
    }
    this.subscribers.get(subscriptionKey)!.add(callback);
    this.pollingLoop.start();

    return () => this.unsubscribe(subscriptionKey, callback);
  }

  private unsubscribe(subscriptionKey: string, callback: SubscriptionCallback<TEvent>) {
    const subscriptionCallbacks = this.subscribers.get(subscriptionKey);
    if (subscriptionCallbacks) {
      subscriptionCallbacks.delete(callback);
      if (subscriptionCallbacks.size === 0) {
        this.subscribers.delete(subscriptionKey);
        this.eventSequence.delete(subscriptionKey);
      }
    }
    if (this.subscribers.size === 0) {
      this.pollingLoop.stop();
    }
  }

  emitEvent(subject: string, key: string, event: TEvent, eventChangeId: number) {
    const subscriptionKeys = [createSubscriptionKey(subject, key)].concat(
      this.allowWildcardSubscriptions ? [createSubscriptionKey(subject, '*')] : [],
    );
    for (const subscriptionKey of subscriptionKeys) {
      const subscribers = this.subscribers.get(subscriptionKey);
      if (subscribers) {
        for (const subscriptionCallback of subscribers) {
          subscriptionCallback(event);
        }
      }
    }
    this.eventSequence.set(subscriptionKeys[0], eventChangeId);
  }

  checkHasSubscribers(subject: string, key: string) {
    const subscriptionKeys = [createSubscriptionKey(subject, key)].concat(
      this.allowWildcardSubscriptions ? [createSubscriptionKey(subject, '*')] : [],
    );
    return subscriptionKeys.some((subscriptionKey) => this.subscribers.has(subscriptionKey));
  }

  getEventSequence(subject: string, key: string) {
    return this.eventSequence.get(createSubscriptionKey(subject, key)) ?? 0;
  }

  getSubscriptionKeys() {
    return Array.from(this.subscribers.keys()).map(splitSubscriptionKey);
  }
}

function createSubscriptionKey(subject: string, key: string) {
  return `${subject}::${key}`;
}

function splitSubscriptionKey(subscriptionKey: string) {
  return subscriptionKey.split('::');
}
