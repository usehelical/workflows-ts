import { sql } from 'kysely';
import { Database } from '../db/db';

type RunResult = {
  result?: string;
  error?: string;
};

export async function recordRunResult(
  db: Database,
  runId: string,
  result: RunResult,
  cancelled?: boolean,
) {
  const [{ change_id }] = await db
    .updateTable('runs')
    .set({
      output: result.result,
      error: result.error,
      status: cancelled ? 'cancelled' : result.error ? 'error' : 'success',
      updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
    })
    .where('id', '=', runId)
    .returning(['change_id'])
    .execute();
  return change_id;
}
