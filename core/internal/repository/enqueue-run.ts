import { sql } from 'kysely';
import { Database, Transaction } from '../db/db';

export type EnqueueRunOptions = {
  runId: string;
  path: string[];
  inputs: string;
  executorId: string;
  workflowName: string;
  timeout?: number;
  deadline?: number;
  recoveryAttempts?: number;
  deduplicationId?: string;
  queueName: string;
  queuePartitionKey?: string;
};

export async function enqueueRun(db: Database | Transaction, options: EnqueueRunOptions) {
  const result = await db
    .insertInto('runs')
    .values({
      id: options.runId,
      path: options.path,
      inputs: options.inputs,
      queue_name: options.queueName,
      queue_partition_key: options.queuePartitionKey,
      queue_deduplication_id: options.deduplicationId,
      executor_id: options.executorId,
      workflow_name: options.workflowName,
      status: 'queued',
      recovery_attempts: options.recoveryAttempts,
      created_at: sql`(extract(epoch from now()) * 1000)::bigint`,
      updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
    })
    .onConflict((oc) => oc.columns(['queue_name', 'queue_deduplication_id']).doNothing())
    .returning(['id', 'change_id'])
    .executeTakeFirst();

  return {
    runId: result?.id,
    changeId: result?.change_id,
  };
}
