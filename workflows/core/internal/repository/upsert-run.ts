import { sql } from 'kysely';
import { WorkflowStatus } from '../../workflow';
import { Database, Transaction } from '../db/client';
import { MaxRecoveryAttemptsExceededError } from '../errors';

const DEFAULT_MAX_RETRIES = 10;

export type UpsertRunOptions = {
  runId: string;
  path: string[];
  inputs: string;
  executorId: string;
  workflowName: string;
  parentRunId?: string;
  status: WorkflowStatus;
  idempotencyKey?: string;
  timeout?: number;
  deadline?: number;
  isRecovery?: boolean;
  isDequeue?: boolean;
  maxRetries?: number;
  queueName?: string;
};

export type UpsertRunResult = {
  runId: string;
  path: string[];
  changeId: number;
  executorId?: string;
  recoveryAttempts: number;
  idempotencyKey?: string;
  status: WorkflowStatus;
  shouldExecute: boolean;
};

export async function upsertRun(
  db: Database | Transaction,
  options: UpsertRunOptions,
): Promise<UpsertRunResult> {
  const incrementAttempts = options.isRecovery || options.isDequeue ? 1 : 0;
  const initialRecoveryAttempts = options.status === 'QUEUED' ? 0 : 1;

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
            WHEN runs.status != 'QUEUED' 
            THEN runs.recovery_attempts + ${incrementAttempts}
            ELSE runs.recovery_attempts
          END`,

        // Update executor_id when NEW status is not ENQUEUED
        // This allows dequeue operations to claim the workflow
        executor_id: sql`CASE 
            WHEN EXCLUDED.status != 'QUEUED' 
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
  const shouldExecute = isOwner || options.isRecovery || options.isDequeue;

  // Check max recovery attempts if authorized to execute
  if (shouldExecute) {
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    if ((result.recovery_attempts as unknown as number) > maxRetries + 1) {
      // Mark as exceeded
      await db
        .updateTable('runs')
        .set({
          status: 'MAX_RECOVERY_ATTEMPTS_EXCEEDED',
          updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
        })
        .where('id', '=', result.id)
        .where('status', '=', 'PENDING')
        .execute();

      throw new MaxRecoveryAttemptsExceededError(result.id, maxRetries);
    }
  }

  return {
    runId: result.id,
    path: options.path,
    changeId: result.change_id,
    recoveryAttempts: result.recovery_attempts as unknown as number,
    executorId: result.executor_id ?? undefined,
    idempotencyKey: result.idempotency_key ?? undefined,
    status: result.status as WorkflowStatus,
    shouldExecute: shouldExecute ?? false,
  };
}
