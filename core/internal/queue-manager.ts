import { PollingLoop } from './events/polling-loop';
import { getExecutableRuns } from './repository/get-executable-runs';
import { QueueRateLimit } from '../queue';
import { deserialize } from './serialization';
import { executeWorkflow } from './execute-workflow';
import { RuntimeContext } from './runtime-context';
import { getQueuePartitions } from './repository/get-queue-partitions';

export interface QueueInstance {
  rateLimit?: QueueRateLimit;
  workerConcurrency?: number;
  concurrency?: number;
  priorityEnabled?: boolean;
  partitioningEnabled?: boolean;
}

const POLLING_INTERVAL_MS = 1000;

export class QueueManager {
  private readonly pollingLoop: PollingLoop;
  private readonly queues: Record<string, QueueInstance> = {};

  constructor(private readonly ctx: RuntimeContext) {
    this.pollingLoop = new PollingLoop(POLLING_INTERVAL_MS, this.handlePoll.bind(this));
    this.queues = this.ctx.queueRegistry.getQueueInstances();
  }

  private async handlePoll() {
    for (const [queueName, queue] of Object.entries(this.queues)) {
      await this.dispatch(queueName, queue);
    }
  }

  private async dispatch(queueName: string, queue: QueueInstance) {
    const { db, executorId } = this.ctx;

    let partitions: string[] = [];

    if (queue.partitioningEnabled) {
      partitions = await getQueuePartitions(db, queueName);

      for (const partition of partitions) {
        const runs = await getExecutableRuns(db, {
          queueName,
          executorId,
          workerConcurrency: queue.workerConcurrency,
          globalConcurrency: queue.concurrency,
          rateLimit: queue.rateLimit,
          partitionKey: partition,
          priorityEnabled: queue.priorityEnabled,
        });
        for (const run of runs) {
          const workflow = this.ctx.workflowRegistry.getByName(run.workflowName);
          if (!workflow) {
            console.error(`Workflow ${run.workflowName} not found`);
            continue;
          }
          await executeWorkflow(this.ctx, {
            runId: run.runId,
            runPath: run.path,
            workflowName: run.workflowName,
            fn: workflow.fn,
            args: deserialize<unknown[]>(run.inputs ?? '[]'),
          });
        }
      }
      return;
    }

    const runs = await getExecutableRuns(db, {
      queueName,
      executorId,
      workerConcurrency: queue.workerConcurrency,
      globalConcurrency: queue.concurrency,
      rateLimit: queue.rateLimit,
      priorityEnabled: queue.priorityEnabled,
    });
    for (const run of runs) {
      const workflow = this.ctx.workflowRegistry.getByName(run.workflowName);
      if (!workflow) {
        console.error(`Workflow ${run.workflowName} not found`);
        continue;
      }
      await executeWorkflow(this.ctx, {
        runId: run.runId,
        runPath: run.path,
        workflowName: run.workflowName,
        fn: workflow.fn,
        args: deserialize<unknown[]>(run.inputs ?? '[]'),
      });
    }
  }

  start() {
    this.pollingLoop.start();
  }

  destroy() {
    this.pollingLoop.stop();
  }
}
