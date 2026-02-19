import { Database, Transaction } from '../db';

type InsertStateOptions = {
  runId: string;
  key: string;
  value: string;
  sequenceId: number;
};

export async function insertState(tx: Transaction | Database, options: InsertStateOptions) {
  await tx
    .insertInto('state')
    .values({
      run_id: options.runId,
      key: options.key,
      value: options.value,
    })
    .onConflict((oc) =>
      oc.column('run_id').column('key').doUpdateSet({
        value: options.value,
      }),
    )
    .execute();

  await tx
    .insertInto('state_history')
    .values({
      run_id: options.runId,
      sequence_id: options.sequenceId,
      key: options.key,
      value: options.value,
    })
    .execute();
}
