type UnsubscribeFn = () => void;
type SubscribeFn<T> = (callback: (data: T) => void) => UnsubscribeFn;

export async function* subscriptionToAsyncIterator<T>(
  subscribe: SubscribeFn<T>,
  options?: {
    onError?: (error: Error) => void;
  },
): AsyncIterableIterator<T> {
  const messageQueue: T[] = [];
  const pendingResolvers: Array<(value: T) => void> = [];
  let isComplete = false;
  let error: Error | null = null;

  const unsubscribe = subscribe((data) => {
    if (pendingResolvers.length > 0) {
      const resolve = pendingResolvers.shift()!;
      resolve(data);
    } else {
      messageQueue.push(data);
    }
  });

  try {
    while (!isComplete && !error) {
      if (messageQueue.length > 0) {
        yield messageQueue.shift()!;
      } else {
        const nextMessage = await new Promise<T>((resolve, reject) => {
          if (error) reject(error);
          pendingResolvers.push(resolve);
        });
        yield nextMessage;
      }
    }
  } finally {
    unsubscribe();
  }
}
