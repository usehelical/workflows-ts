import { Database, Transaction } from '../db';

export async function insertOperation(
  tx: Transaction | Database,
  runId: string,
  operationName: string,
  sequenceId: number,
  result?: string,
  error?: string,
) {
  await tx
    .insertInto('operations')
    .values({
      run_id: runId,
      name: operationName,
      sequence_id: sequenceId,
      output: result,
      error: error,
    })
    .execute();
}
