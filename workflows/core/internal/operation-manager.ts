import { Kysely, Transaction } from 'kysely';
import { withDBRetry } from './db/retry';
import { getWorkflowStore } from './store';
import { WorkflowCancelledError } from './errors';

export interface Operation<T = unknown> {
  workflowId: string;
  operationName: string;
  sequenceId: number;
  outputs: T;
}

// the operation manager is responsible recording and retrieving operation results
// when workflows are replayed it can be prepopulated with operations from the database
export class OperationManager {
  private sequenceId = 0;
  constructor(
    private readonly db: Kysely<any>,
    private readonly workflowId: string,
    private readonly operations: Operation[] = [],
  ) {}

  getOperationResult<T = unknown>(): Operation<T> | null {
    this.sequenceId++;
    return this.operations[this.sequenceId - 1] as Operation<T>;
  }

  async runOperationAndRecordResult<T>(
    operationName: string,
    callback: (tx: Transaction<any>) => Promise<T>,
  ) {
    return withDBRetry(async () => {
      return await this.db.transaction().execute(async (tx) => {
        await checkCancellation(tx, this.workflowId);
        const result = await callback(tx);
        await recordOperation(tx, this.workflowId, operationName, this.sequenceId, result);
        this.sequenceId++;
        return result;
      });
    });
  }
}

async function recordOperation(
  tx: Transaction<any>,
  workflowId: string,
  operationName: string,
  sequenceId: number,
  outputs: any,
) {
  return await tx
    .insertInto('operations')
    .values({
      workflow_id: workflowId,
      operation_name: operationName,
      sequence_id: sequenceId,
      outputs: outputs,
    })
    .execute();
}

async function checkCancellation(tx: Transaction<any>, workflowId: string) {
  const { isCancelled } = getWorkflowStore();
  if (isCancelled) {
    throw new WorkflowCancelledError();
  }
  const workflow = await tx
    .selectFrom('workflows')
    .selectAll()
    .where('workflow_id', '=', workflowId)
    .executeTakeFirst();
  if (workflow?.status === 'CANCELLED') {
    throw new WorkflowCancelledError();
  }
}
