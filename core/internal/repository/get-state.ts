import { Database } from '../db/db';

export async function getState(
  db: Database,
  runId: string,
  key: string,
): Promise<string | undefined> {
  const result = await db
    .selectFrom('state')
    .select(['key', 'value', 'change_id'])
    .where('run_id', '=', runId)
    .where('key', '=', key)
    .executeTakeFirst();

  if (!result) {
    return undefined;
  }

  return result.value;
}
