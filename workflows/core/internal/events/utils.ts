const WILDCARD_KEY = '*';

type Wildcard = '*';

export function getMatchingSubscriptionKeys(...args: string[]): string[] {
  return [
    makeSubscriptionKey(...args), // exact match
    makeSubscriptionKey(...args.slice(0, -1), WILDCARD_KEY), // wildcard: replace last arg
  ];
}

export function checkHasSubscribers(subscriptionMap: Map<string, Set<any>>, key: string): boolean {
  const subscribers = subscriptionMap.get(key);
  return !!subscribers && subscribers.size > 0;
}

export function checkHasSubscribersWithWildcard(
  subscriptionMap: Map<string, Set<any>>,
  ...args: string[]
): boolean {
  const keys = getMatchingSubscriptionKeys(...args);
  return keys.some((key) => {
    const subscribers = subscriptionMap.get(key);
    return subscribers && subscribers.size > 0;
  });
}

export function makeSubscriptionKey(...args: string[]): string {
  return args.join('::');
}

export function makeEventKey(...args: string[]): string {
  return args.join('::');
}

export function checkEventSequence(
  eventSequence: Map<string, number>,
  eventKey: string,
  changeId: number | string,
) {
  return eventSequence.get(eventKey) && eventSequence.get(eventKey)! >= Number(changeId);
}
