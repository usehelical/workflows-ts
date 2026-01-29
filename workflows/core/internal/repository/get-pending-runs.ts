import { WorkflowStatus } from '../../workflow';
import { Database } from '../db/db';

export async function getPendingRuns(db: Database, executorId: string) {
  const pendingRuns = await db
    .selectFrom('runs')
    .select(['id', 'path', 'inputs', 'workflow_name'])
    .where('status', '=', WorkflowStatus.PENDING)
    .where('executor_id', '=', executorId)
    .execute();

  return pendingRuns.map((run) => ({
    id: run.id,
    path: run.path,
    inputs: run.inputs,
    workflowName: run.workflow_name,
  }));
}
