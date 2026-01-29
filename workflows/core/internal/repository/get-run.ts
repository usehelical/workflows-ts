import { WorkflowStatus } from '../../workflow';
import { Database } from '../db/db';

interface WorkflowResult {
  id: string;
  input?: string;
  output?: string;
  error?: string;
  status: WorkflowStatus;
  queueName?: string;
  changeId: number;
}

export async function getRun(db: Database, runId: string): Promise<WorkflowResult | undefined> {
  const result = await db
    .selectFrom('runs')
    .select(['id', 'inputs', 'output', 'error', 'status', 'change_id'])
    .where('id', '=', runId)
    .executeTakeFirst();

  if (!result) {
    return undefined;
  }

  return {
    id: result.id,
    input: result.inputs ?? undefined,
    output: result.output ?? undefined,
    error: result.error ?? undefined,
    status: result.status as WorkflowStatus,
    changeId: result.change_id,
  };
}
