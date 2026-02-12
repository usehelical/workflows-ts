import { sql } from 'kysely';
import { QueueRateLimit } from '@api/queue';
import { Database } from '../db';
import { withDbRetry } from '../retry';
import { DequeuedRun, dequeueRun } from '../commands/dequeue-run';

type GetExecutableRunsParams = {
  queueName: string;
  executorId: string;
  workerConcurrency?: number;
  globalConcurrency?: number;
  rateLimit?: QueueRateLimit;
  partitionKey?: string;
  priorityEnabled?: boolean;
};

export async function getExecutableRuns(
  db: Database,
  {
    queueName,
    executorId,
    workerConcurrency,
    globalConcurrency,
    rateLimit,
    partitionKey,
    priorityEnabled,
  }: GetExecutableRunsParams,
): Promise<DequeuedRun[]> {
  const startTimeMs = Date.now();
  const limiterPeriodMs = rateLimit ? rateLimit.period * 1000 : 0;

  return await withDbRetry(async () =>
    db.transaction().execute(async (tx) => {
      // rate limit check
      if (rateLimit) {
        const result = await tx
          .selectFrom('runs')
          .select(({ fn }) => [fn.count<number>('id').as('count')])
          .where('queue_name', '=', queueName)
          .where('status', '!=', 'queued')
          .where('started_at_epoch_ms', '>', (startTimeMs - limiterPeriodMs).toString())
          .$if(partitionKey !== undefined, (qb) =>
            qb.where('queue_partition_key', '=', partitionKey!),
          )
          .executeTakeFirstOrThrow();

        if (result.count >= rateLimit.limitPerPeriod) {
          return [];
        }
      }

      // Calculate concurrency
      let maxTasks = Infinity;

      if (globalConcurrency || workerConcurrency) {
        const runningTasks = await tx
          .selectFrom('runs')
          .select(['executor_id', ({ fn }) => fn.count<number>('id').as('task_count')])
          .where('queue_name', '=', queueName)
          .where('status', '=', 'pending')
          .$if(partitionKey !== undefined, (qb) =>
            qb.where('queue_partition_key', '=', partitionKey!),
          )
          .groupBy('executor_id')
          .execute();

        const tasksByExecutor = Object.fromEntries(
          runningTasks.map((row) => [row.executor_id!, row.task_count]),
        );

        const runningForThisWorker = tasksByExecutor[executorId] ?? 0;

        if (workerConcurrency !== undefined) {
          maxTasks = Math.max(0, workerConcurrency - runningForThisWorker);
        }

        if (globalConcurrency !== undefined) {
          const totalRunning = Object.values(tasksByExecutor).reduce((a, b) => a + b, 0);
          const availableGlobal = Math.max(0, globalConcurrency - totalRunning);
          maxTasks = Math.min(maxTasks, availableGlobal);
        }

        if (maxTasks <= 0) {
          return [];
        }
      }

      const lockClause = globalConcurrency ? 'FOR UPDATE NOWAIT' : 'FOR UPDATE SKIP LOCKED';

      const workflowIds = await sql<{ id: string }>`
        SELECT id 
          FROM runs
          WHERE status = ${'queued'}
          AND queue_name = ${queueName}
          ${partitionKey !== undefined ? sql`AND queue_partition_key = ${partitionKey}` : sql``}
        ${priorityEnabled ? sql`ORDER BY priority ASC, created_at ASC` : sql`ORDER BY created_at ASC`}
        ${maxTasks !== Infinity ? sql`LIMIT ${maxTasks}` : sql``}
        ${sql.raw(lockClause)}
      `.execute(tx);

      const claimedRuns: DequeuedRun[] = [];

      for (const { id } of workflowIds.rows) {
        const dequeuedRun = await dequeueRun(tx, id, executorId);
        claimedRuns.push(dequeuedRun);
      }

      return claimedRuns;
    }),
  );
}
