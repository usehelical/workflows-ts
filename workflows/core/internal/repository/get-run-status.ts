import { WorkflowStatus } from '../../workflow';
import { Database } from '../db/client';
import { RunNotFoundError } from '../errors';

export async function getRunStatus(db: Database, runId: string): Promise<WorkflowStatus> {
  const run = await db
    .selectFrom('runs')
    .select('status')
    .where('id', '=', runId)
    .executeTakeFirst();
  if (!run) {
    throw new RunNotFoundError(runId);
  }
  return run.status as WorkflowStatus;
}
