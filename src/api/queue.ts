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

export type QueueDefinition = QueueOptions;

export function defineQueue(options: QueueOptions = {}): QueueDefinition {
  return options;
}
