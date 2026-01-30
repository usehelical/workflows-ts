import { sql } from 'kysely';
import { WorkflowStatus } from '../../workflow';
import { Transaction } from '../db/db';
import { RunNotFoundError } from '../errors';

export type DequeuedRun = {
  runId: string;
  changeId: number;
  path: string[];
  timeoutMs?: number;
  deadlineEpochMs?: number;
  inputs?: string;
  workflowName: string;
};

export async function dequeueRun(
  tx: Transaction,
  runId: string,
  executorId: string,
): Promise<DequeuedRun> {
  const result = await tx
    .updateTable('runs')
    .set({
      status: WorkflowStatus.PENDING,
      updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
      executor_id: executorId,
    })
    .where('id', '=', runId)
    .where('status', '=', WorkflowStatus.QUEUED)
    .returning([
      'id',
      'change_id',
      'path',
      'timeout_ms',
      'deadline_epoch_ms',
      'inputs',
      'workflow_name',
    ])
    .executeTakeFirst();

  if (!result) {
    throw new RunNotFoundError(runId);
  }

  return {
    runId: result.id,
    changeId: result.change_id,
    path: result.path,
    timeoutMs: result.timeout_ms ? Number(result.timeout_ms) : undefined,
    deadlineEpochMs: result.deadline_epoch_ms ? Number(result.deadline_epoch_ms) : undefined,
    inputs: result.inputs ?? undefined,
    workflowName: result.workflow_name,
  };
}
