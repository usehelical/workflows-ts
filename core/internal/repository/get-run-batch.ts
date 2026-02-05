import { RunStatus } from '../../workflow';
import { Database } from '../db/db';

export async function getRunBatch(db: Database, runIds: string[]) {
  const results = await db
    .selectFrom('runs')
    .select(['id', 'inputs', 'output', 'error', 'status', 'change_id', 'queue_name'])
    .where('id', 'in', runIds)
    .execute();
  return results.map((r) => ({
    id: r.id,
    input: r.inputs ?? undefined,
    output: r.output ?? undefined,
    error: r.error ?? undefined,
    status: r.status as RunStatus,
    changeId: r.change_id,
    queueName: r.queue_name ?? undefined,
  }));
}
