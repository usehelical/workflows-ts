import { withDbRetry } from '../db/retry';
import { deserialize, deserializeError, serialize, serializeError } from '../utils/serialization';
import { getExecutionContext } from './execution-context';
import { RunCancelledError } from '../errors';
import { getRun } from '../db/queries/get-run';
import { insertOperation } from '../db/commands/insert-operation';
import { Database, Transaction } from '../db/db';

export interface OperationResult {
  result?: string;
  error?: string;
}

export class OperationManager {
  private sequenceId = 0;
  private lastReservedSequenceId: number | null = null;
  constructor(
    private readonly db: Database,
    private readonly runId: string,
    // operations are stored in reverse order so the most recent operation is at the beginning of the array
    private readonly operations: OperationResult[] = [],
  ) {}

  getOperationResult(): OperationResult | null {
    const operation = this.operations.pop() as OperationResult;
    if (operation) {
      this.sequenceId++;
      return operation;
    }
    return null;
  }

  reserveSequenceId() {
    const reserved = this.sequenceId++;
    this.lastReservedSequenceId = reserved;
    return reserved;
  }

  getCurrentSequenceId() {
    return this.sequenceId;
  }

  /**
   * Gets the sequence ID that was most recently reserved for the current operation.
   * This is the ID that will be (or was) recorded in the database for this operation.
   * Returns null if no sequence ID has been reserved yet.
   */
  getActiveSequenceId(): number | null {
    return this.lastReservedSequenceId;
  }

  async recordResult(
    operationName: string,
    sequenceId: number,
    result: string | null,
    tx?: Transaction,
  ) {
    if (tx) {
      await insertOperation(tx, this.runId, operationName, sequenceId, result ?? undefined);
    } else {
      await withDbRetry(async () => {
        await insertOperation(this.db, this.runId, operationName, sequenceId, result ?? undefined);
      });
    }
  }

  async recordError(
    operationName: string,
    sequenceId: number,
    error: string | null,
    tx?: Transaction,
  ) {
    if (tx) {
      await insertOperation(
        tx,
        this.runId,
        operationName,
        sequenceId,
        undefined,
        error ?? undefined,
      );
    } else {
      await withDbRetry(async () => {
        await insertOperation(
          this.db,
          this.runId,
          operationName,
          sequenceId,
          undefined,
          error ?? undefined,
        );
      });
    }
  }
}

export function returnOrThrowOperationResult<T = void>(
  op: OperationResult,
): T extends void ? void : T {
  if (op.error) {
    throw deserializeError(op.error);
  }

  if (op.result === null || op.result === undefined) {
    return undefined as T extends void ? void : T;
  }

  return deserialize(op.result) as T extends void ? void : T;
}

export async function executeAndRecordOperation<T>(
  operationManager: OperationManager,
  operationName: string,
  callback: () => Promise<T>,
): Promise<T> {
  const seqId = operationManager.reserveSequenceId();
  try {
    const result = await callback();
    const serializedResult = serialize(result);
    await checkCancellation();
    await operationManager.recordResult(operationName, seqId, serializedResult);
    return result;
  } catch (error) {
    if (error instanceof RunCancelledError) {
      throw error;
    }
    const err = error instanceof Error ? error : new Error(String(error));
    await operationManager.recordError(operationName, seqId, serializeError(err));
    throw error;
  }
}

async function checkCancellation() {
  const { abortSignal, runId, db } = getExecutionContext();
  if (abortSignal.aborted) {
    throw new RunCancelledError();
  }
  const run = await withDbRetry(async () => getRun(db, runId));
  if (run?.status === 'cancelled') {
    throw new RunCancelledError();
  }
}
