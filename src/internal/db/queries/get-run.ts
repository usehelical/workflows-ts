import { RunStatus } from '@api/workflow';
import { Database } from '../db';

interface WorkflowResult {
  id: string;
  input?: string;
  output?: string;
  error?: string;
  status: RunStatus;
  name: string;
  queueName?: string;
  changeId: number;
  recoveryAttempts: number;
}

export async function getRun(db: Database, runId: string): Promise<WorkflowResult | undefined> {
  const result = await db
    .selectFrom('runs')
    .select([
      'id',
      'inputs',
      'output',
      'error',
      'status',
      'change_id',
      'recovery_attempts',
      'workflow_name',
    ])
    .where('id', '=', runId)
    .executeTakeFirst();

  if (!result) {
    return undefined;
  }

  return {
    id: result.id,
    input: result.inputs ?? undefined,
    name: result.workflow_name,
    output: result.output ?? undefined,
    error: result.error ?? undefined,
    status: result.status as RunStatus,
    changeId: result.change_id,
    recoveryAttempts: Number(result.recovery_attempts ?? 0),
  };
}
