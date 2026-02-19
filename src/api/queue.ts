export type QueueRateLimit = {
  limitPerPeriod: number;
  period: number;
};

export type QueueOptions = {
  workerConcurrency?: number;
  concurrency?: number;
  rateLimit?: QueueRateLimit;
  priorityEnabled?: boolean;
  partitioningEnabled?: boolean;
};

export type QueueDefinition = QueueOptions & {
  name: string;
};

export function defineQueue(name: string, options: QueueOptions = {}): QueueDefinition {
  return {
    name,
    ...options,
  };
}
