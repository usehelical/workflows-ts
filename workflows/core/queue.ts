export type QueueRateLimit = {
  limitPerPeriod: number;
  period: number;
};

export type QueueOptions = {
  workerConcurrency?: number;
  concurrency?: number;
  rateLimit?: QueueRateLimit;
  priorityEnabled?: boolean;
};

const defaultQueueOptions: QueueOptions = {
  workerConcurrency: Infinity,
  concurrency: Infinity,
  priorityEnabled: false,
};

export function defineQueue(
  name: string,
  options: QueueOptions = defaultQueueOptions,
): QueueDefinition {
  return {
    name,
    options,
  };
}

export type QueueDefinition = {
  name: string;
  options: QueueOptions;
};
