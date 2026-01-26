import { WorkflowStatus } from '../../workflow';
import { OperationResult } from '../operation-manager';
import { Database, Transaction } from '../db/client';

interface WorkflowResult {
  id: string;
  input?: string;
  output?: string;
  error?: string;
  status: WorkflowStatus;
  queueName?: string;
  changeId: number;
}

export type UpsertRunOptions = {
  runId?: string;
  inputs: string;
  executorId: string;
  workflowName: string;
  parentRunId?: string;
  status: WorkflowStatus;
  idempotencyKey?: string;
  isRecovery?: boolean;
};

export type Message = {
  messageId: string;
  destinationRunId: string;
  data?: string;
};

export type StateRetrievalRequest = {
  runId: string;
  key: string;
};

export type StateRetrievalResult = {
  runId: string;
  key: string;
  data: unknown;
  changeId: number;
};

export type InsertOperationModel = {
  runId: string;
  operationName: string;
  sequenceId: number;
  result?: string;
  error?: string;
  childRunId?: string;
  startedAtEpochMs?: number;
  completedAtEpochMs?: number;
};

export type InsertRunResult = {
  id: string;
  changeId: number;
  recoveryAttempts: number;
  executorId: string;
  idempotencyKey: string;
  status: WorkflowStatus;
  shouldExecute: boolean;
};

export interface Repository {
  insertRun: (db: Transaction | Database, options: UpsertRunOptions) => Promise<InsertRunResult>;
  getRun: (db: Database, workflowId: string) => Promise<WorkflowResult | undefined>;
  getState: (
    db: Database,
    workflowId: string,
    key: string,
  ) => Promise<StateRetrievalResult | undefined>;
  insertState: (tx: Transaction, workflowId: string, key: string, value: string) => Promise<void>;
  getMultipleStates: (
    db: Database,
    requests: StateRetrievalRequest[],
  ) => Promise<StateRetrievalResult[]>;
  getMultipleRuns: (db: Database, ids: string[]) => Promise<WorkflowResult[]>;
  readAndDeleteMessage: (
    tx: Transaction,
    workflowId: string,
    messageType: string,
  ) => Promise<Message | undefined>;
  insertMessage: (
    tx: Transaction,
    destinationWorkflowId: string,
    messageType: string,
    data: string,
  ) => Promise<void>;
  getRunOperations: (db: Database, runId: string) => Promise<OperationResult[]>;
  insertOperation: (
    tx: Transaction | Database,
    workflowId: string,
    operationName: string,
    sequenceId: number,
    result?: string,
    error?: string,
  ) => Promise<void>;
}

export class RepositoryImpl implements Repository {
  async insertRun(db: Database | Transaction, options: UpsertRunOptions) {
    const result = await db
      .insertInto('runs')
      .values({
        id: options.runId,
        workflow_name: options.workflowName,
        status: options.status,
        inputs: options.inputs,
        executor_id: options.executorId,
        parent_run_id: options.parentRunId,
        idempotency_key: options.idempotencyKey,
      })
      .returning(['id', 'change_id', 'recovery_attempts', 'executor_id', 'idempotency_key'])
      .executeTakeFirst();
    if (!result) {
      throw new Error('Unexptectedly failed to insert run');
    }
    return {
      id: result.id,
      changeId: result.change_id,
      recoveryAttempts: result.recovery_attempts,
      executorId: result.executor_id,
      idempotencyKey: result.idempotency_key,
    };
  }

  async getState(db: Database, runId: string, key: string) {
    const result = await db
      .selectFrom('state')
      .select(['run_id', 'key', 'value', 'change_id'])
      .where('run_id', '=', runId)
      .where('key', '=', key)
      .executeTakeFirst();

    if (!result) {
      return undefined;
    }

    return {
      runId: result.run_id,
      key: result.key,
      data: result.value,
      changeId: result.change_id,
    };
  }

  async getMultipleStates(
    db: Database,
    requests: StateRetrievalRequest[],
  ): Promise<StateRetrievalResult[]> {
    const results = await db
      .selectFrom('state')
      .select(['run_id', 'key', 'value', 'change_id'])
      .where(
        'run_id',
        'in',
        requests.map((r) => r.runId),
      )
      .where(
        'key',
        'in',
        requests.map((r) => r.key),
      )
      .execute();

    return results.map((r) => ({
      runId: r.run_id,
      key: r.key,
      data: r.value,
      changeId: r.change_id,
    }));
  }

  async getMultipleRuns(db: Database, ids: string[]): Promise<WorkflowResult[]> {
    const results = await db
      .selectFrom('runs')
      .select(['id', 'inputs', 'output', 'error', 'status', 'change_id'])
      .where('id', 'in', ids)
      .execute();
    return results.map((r) => ({
      id: r.id,
      input: r.inputs ?? undefined,
      output: r.output ?? undefined,
      error: r.error ?? undefined,
      status: r.status as WorkflowStatus,
      changeId: r.change_id,
    }));
  }

  async readAndDeleteMessage(
    tx: Transaction,
    destinationRunId: string,
    messageType: string,
  ): Promise<Message | undefined> {
    const result = await tx
      .deleteFrom('messages')
      .where('destination_run_id', '=', destinationRunId)
      .where('type', '=', messageType)
      .returning(['id', 'destination_run_id', 'payload'])
      .orderBy('created_at_epoch_ms', 'asc')
      .limit(1)
      .executeTakeFirst();
    return result
      ? {
          messageId: result.id,
          destinationRunId: result.destination_run_id,
          data: result.payload ?? undefined,
        }
      : undefined;
  }

  async insertMessage(
    tx: Transaction,
    destinationRunId: string,
    messageType: string,
    data: string,
  ) {
    await tx
      .insertInto('messages')
      .values({
        destination_run_id: destinationRunId,
        type: messageType,
        payload: data,
      })
      .executeTakeFirst();
  }

  async insertState(tx: Transaction, runId: string, key: string, value: string) {
    await tx
      .insertInto('state')
      .values({
        run_id: runId,
        key: key,
        value: value,
      })
      .executeTakeFirst();
  }
}
