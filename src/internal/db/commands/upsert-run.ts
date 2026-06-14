import { sql } from 'kysely';
import { RunStatus } from '../../../api/workflow';
import { Database, Transaction } from '../db';

export type UpsertRunOptions = {
  runId: string;
  path: string[];
  inputs: string;
  executorId: string;
  workflowName: string;
  parentRunId?: string;
  status: RunStatus;
  idempotencyKey?: string;
  timeout?: number;
  deadline?: number;
  isRecovery?: boolean;
  queueName?: string;
};

export type UpsertRunResult = {
  runId: string;
  path: string[];
  changeId: number;
  executorId?: string;
  recoveryAttempts: number;
  idempotencyKey?: string;
  status: RunStatus;
  shouldExecute: boolean;
};

export async function upsertRun(
  db: Database | Transaction,
  options: UpsertRunOptions,
): Promise<UpsertRunResult> {
  const incrementAttempts = options.isRecovery ? 1 : 0;
  const initialRecoveryAttempts = options.status === 'queued' ? 0 : 1;

  const result = await db
    .insertInto('runs')
    .values({
      id: options.runId,
      path: options.path,
      workflow_name: options.workflowName,
      status: options.status,
      inputs: options.inputs,
      idempotency_key: options.idempotencyKey,
      executor_id: options.executorId,
      parent_run_id: options.parentRunId,
      timeout_ms: options.timeout,
      deadline_epoch_ms: options.deadline,
      recovery_attempts: initialRecoveryAttempts,
      queue_name: options.queueName,
      created_at: sql`(extract(epoch from now()) * 1000)::bigint`,
      updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
    })
    .onConflict((oc) =>
      oc.column('id').doUpdateSet({
        recovery_attempts: sql`CASE 
            WHEN runs.status != 'queued' 
            THEN runs.recovery_attempts + ${incrementAttempts}
            ELSE runs.recovery_attempts
          END`,

        // Update executor_id when this is not a queued-status upsert
        executor_id: sql`CASE 
            WHEN EXCLUDED.status != 'queued' 
            THEN EXCLUDED.executor_id
            ELSE runs.executor_id
          END`,

        updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
      }),
    )
    .returning([
      'id',
      'change_id',
      'recovery_attempts',
      'executor_id',
      'idempotency_key',
      'status',
      'path',
    ])
    .executeTakeFirst();

  if (!result) {
    throw new Error('Unexpectedly failed to upsert run');
  }

  // check if idempotency key matches
  const isOwner = result.idempotency_key === options.idempotencyKey;
  const shouldExecute = isOwner || options.isRecovery;

  // Max-recovery-attempts enforcement is now handled by LocalReaper at claim
  // time using lowercase statuses and the new lease-based recovery path.
  // This branch is intentionally removed to avoid the uppercase status bug.

  return {
    runId: result.id,
    path: options.path,
    changeId: result.change_id,
    recoveryAttempts: result.recovery_attempts as unknown as number,
    executorId: result.executor_id ?? undefined,
    idempotencyKey: result.idempotency_key ?? undefined,
    status: result.status as RunStatus,
    shouldExecute: shouldExecute ?? false,
  };
}
