import { QueueDefinition, QueueEntry } from '../queue';
import { QueueInstance } from './queue-manager';

export class QueueRegistry {
  private readonly queues: Record<string, QueueEntry> = {};
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private readonly fnToName: Map<Function, string> = new Map();

  constructor(queues: Record<string, QueueEntry>) {
    this.queues = queues;
    for (const [name, entry] of Object.entries(queues)) {
      this.fnToName.set(entry, name);
    }
  }

  getByName(name: string): QueueDefinition | undefined {
    const entry = this.queues[name];
    if (!entry) {
      return undefined;
    }
    return {
      name,
      ...entry(),
    };
  }

  getByQueueEntry(entry: QueueEntry) {
    const name = this.fnToName.get(entry);
    if (!name) {
      return undefined;
    }
    return {
      ...entry(),
      name,
    };
  }

  getQueueInstances(): Record<string, QueueInstance> {
    return Object.entries(this.queues).reduce(
      (acc, [name, entry]) => {
        const options = entry();
        acc[name] = {
          rateLimit: options.rateLimit ?? undefined,
          workerConcurrency: options.workerConcurrency ?? undefined,
          concurrency: options.concurrency ?? undefined,
          priorityEnabled: options.priorityEnabled ?? undefined,
        };
        return acc;
      },
      {} as Record<string, QueueInstance>,
    );
  }
}
