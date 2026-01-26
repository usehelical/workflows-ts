import { sql } from 'kysely';
import { WorkflowStatus } from '../../workflow';
import { Database } from '../db/client';

type RunResult = {
  result?: string;
  error?: string;
};

export async function recordRunResult(db: Database, runId: string, result: RunResult) {
  const [{ change_id }] = await db
    .updateTable('runs')
    .set({
      output: result.result,
      error: result.error,
      status: result.error ? WorkflowStatus.ERROR : WorkflowStatus.SUCCESS,
      updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
    })
    .where('id', '=', runId)
    .returning(['change_id'])
    .execute();
  return change_id;
}
