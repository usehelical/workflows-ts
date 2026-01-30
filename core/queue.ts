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
  name?: string;
};

export function defineQueue(options: QueueOptions = {}): QueueEntry {
  return () => options;
}

export type QueueEntry = () => QueueOptions;

export type QueueDefinition = QueueOptions & { name: string };
