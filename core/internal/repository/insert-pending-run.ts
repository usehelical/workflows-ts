import { sql } from 'kysely';
import { Database, Transaction } from '../db/db';

export type InsertRunOptions = {
  runId: string;
  path: string[];
  inputs: string;
  executorId: string;
  workflowName: string;
};

export async function insertPendingRun(db: Database | Transaction, options: InsertRunOptions) {
  const result = await db
    .insertInto('runs')
    .values({
      id: options.runId,
      path: options.path,
      inputs: options.inputs,
      executor_id: options.executorId,
      workflow_name: options.workflowName,
      status: 'pending',
      started_at_epoch_ms: sql`(extract(epoch from now()) * 1000)::bigint`,
      created_at: sql`(extract(epoch from now()) * 1000)::bigint`,
      updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
    })
    .returning(['id', 'path', 'change_id'])
    .executeTakeFirst();

  return {
    runId: result!.id,
    path: result!.path,
    changeId: result!.change_id,
  };
}
