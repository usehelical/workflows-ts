import { PollingLoop } from './events/polling-loop';
import { findAndMarkStartableWorkflows } from './repository/find-and-mark-startable-workflows';
import { QueueRateLimit } from '../queue';
import { upsertRun } from './repository/upsert-run';
import { deserialize, serialize } from './serialization';
import { WorkflowStatus } from '../workflow';
import { executeWorkflow } from './execute-workflow';
import { RuntimeContext } from './runtime-context';

export interface QueueInstance {
  name: string;
  config: {
    rateLimit?: QueueRateLimit;
    workerConcurrency?: number;
    concurrency?: number;
  };
  availableSlots?: number;
}

const POLLING_INTERVAL_MS = 1000;

export class QueueManager {
  private readonly pollingLoop: PollingLoop;
  private readonly queues: Record<string, QueueInstance> = {};

  constructor(private readonly ctx: RuntimeContext) {
    this.pollingLoop = new PollingLoop(POLLING_INTERVAL_MS, this.handlePoll.bind(this));
    this.pollingLoop.start();
    this.queues = this.ctx.queueRegistry.getQueueInstances();
  }

  private handlePoll() {
    for (const queueName of Object.keys(this.queues)) {
      this.dispatch(queueName);
    }
  }

  private async dispatch(queueName: string) {
    const { db, executorId } = this.ctx;
    const runs = await findAndMarkStartableWorkflows(
      db,
      queueName,
      this.queues[queueName].availableSlots,
    );
    for (const run of runs) {
      const workflow = this.ctx.workflowRegistry.getByName(run.workflow_name);
      if (!workflow) {
        console.error(`Workflow ${run.workflow_name} not found`);
        continue;
      }

      await upsertRun(db, {
        runId: run.id,
        path: run.path,
        inputs: serialize(run.inputs),
        executorId: executorId,
        workflowName: run.workflow_name,
        status: WorkflowStatus.PENDING,
      });

      await executeWorkflow(this.ctx, {
        runId: run.id,
        runPath: run.path,
        workflowName: run.workflow_name,
        fn: workflow.fn,
        args: deserialize<unknown[]>(run.inputs ?? '[]'),
      });
    }
  }

  destroy() {
    this.pollingLoop.stop();
  }
}
