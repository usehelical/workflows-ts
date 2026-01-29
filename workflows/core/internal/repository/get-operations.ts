import { Database } from '../db/db';
import { OperationResult } from '../operation-manager';

export async function getOperations(db: Database, runId: string): Promise<OperationResult[]> {
  const results = await db
    .selectFrom('operations')
    .select(['output', 'error'])
    .where('run_id', '=', runId)
    .orderBy('sequence_id', 'desc')
    .execute();
  return results.map((r) => ({
    result: r.output ?? undefined,
    error: r.error ?? undefined,
  }));
}
