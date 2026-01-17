import { Kysely, Transaction } from 'kysely';
import { WorkflowStatus } from './workflow';
import { Operation } from './internal/operation-manager';

type InsertWorkflowOptions = {
  name: string;
  inputs: unknown[];
  executorId: string;
  parentWorkflowId?: string;
  workflowId?: string;
};

export async function insertWorkflow(
  tx: Transaction<any>,
  options: InsertWorkflowOptions,
): Promise<string> {
  const result = await tx
    .insertInto('workflows')
    .values({
      workflow_id: options.workflowId,
      namme: options.name,
      status: WorkflowStatus.PENDING,
      inputs: JSON.stringify(options.inputs),
      executor_id: options.executorId,
      parent_workflow_id: options.parentWorkflowId,
    })
    .returning('workflow_id')
    .executeTakeFirst();
  return result?.workflow_id as string;
}

export async function getWorkflowOperations(db: Kysely<any>, workflowId: string) {
  return (await db
    .selectFrom('operations')
    .selectAll()
    .where('workflow_id', '=', workflowId)
    .orderBy('operation_sequence_id', 'asc')
    .execute()) as Operation<unknown>[];
}

interface WorkflowResult {
  id: string;
  input: unknown[];
  output?: unknown;
  error?: string;
  status: WorkflowStatus;
  queueName?: string;
  changeId: number;
}

export async function getWorkflow(db: Kysely<any>, workflowId: string) {
  return (await db
    .selectFrom('workflows')
    .selectAll()
    .where('workflow_id', '=', workflowId)
    .executeTakeFirst()) as WorkflowResult | undefined;
}

export async function getWorkflowList(db: Kysely<any>, ids: string[]) {
  return (await db
    .selectFrom('workflows')
    .selectAll()
    .where('workflow_id', 'in', ids)
    .execute()) as WorkflowResult[];
}

export interface Repository {
  getState: (db: Kysely<any>, workflowId: string, key: string) => Promise<StateRetrievalResult>;
  getMultipleStates: (
    db: Kysely<any>,
    requests: StateRetrievalRequest[],
  ) => Promise<StateRetrievalResult[]>;
  getWorkflow: (db: Kysely<any>, workflowId: string) => Promise<WorkflowResult>;
  getMultipleWorkflows: (db: Kysely<any>, ids: string[]) => Promise<WorkflowResult[]>;
}

export type StateRetrievalRequest = {
  workflowId: string;
  key: string;
};

export type StateRetrievalResult = {
  workflowId: string;
  key: string;
  data: unknown;
  changeId: number;
};

export async function getState(db: Kysely<any>, request: StateRetrievalRequest) {
  const result = await db
    .selectFrom('workflow_contexts')
    .select(['workflow_id', 'key', 'value'])
    .where('workflow_id', '=', request.workflowId)
    .where('key', '=', request.key)
    .executeTakeFirst();

  if (!result) {
    return undefined;
  }

  return {
    workflowId: result.workflow_id,
    key: result.key,
    data: result.value,
  };
}

export async function getMultipleStates(db: Kysely<any>, requests: StateRetrievalRequest[]) {
  const results = await db
    .selectFrom('workflow_contexts')
    .select(['workflow_id', 'key', 'value'])
    .where(
      'workflow_id',
      'in',
      requests.map((r) => r.workflowId),
    )
    .where(
      'key',
      'in',
      requests.map((r) => r.key),
    )
    .execute();

  return results.map((r) => ({
    workflowId: r.workflow_id,
    key: r.key,
    data: r.value,
  }));
}
