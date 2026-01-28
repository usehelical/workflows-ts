export type QueueRateLimit = {
  limitPerPeriod: number;
  period: number;
};

export type QueueOptions = {
  workerConcurrency?: number;
  concurrency?: number;
  rateLimit?: QueueRateLimit;
  priorityEnabled?: boolean;
  name?: string;
};

const defaultQueueOptions: QueueOptions = {
  workerConcurrency: Infinity,
  concurrency: Infinity,
  priorityEnabled: false,
};

export function defineQueue(options: QueueOptions = defaultQueueOptions): QueueEntry {
  return () => options;
}

export type QueueEntry = () => QueueOptions;

export type QueueDefinition = QueueOptions & { name: string };
