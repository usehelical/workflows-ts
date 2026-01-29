import { sql } from 'kysely';
import { WorkflowStatus } from '../../workflow';
import { Database } from '../db/db';
import { RunNotFoundError } from '../errors';
import { withDbRetry } from '../db/retry';

export async function cancelRun(runId: string, db: Database) {
  return withDbRetry(async () => {
    return db.transaction().execute(async (tx) => {
      const result = await tx
        .updateTable('runs')
        .set({
          status: WorkflowStatus.CANCELLED,
          updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
        })
        .where((eb) =>
          eb.and([
            eb('id', '=', runId),
            eb('status', 'not in', [
              WorkflowStatus.CANCELLED,
              WorkflowStatus.SUCCESS,
              WorkflowStatus.ERROR,
            ]),
          ]),
        )
        .returning(['change_id', 'path'])
        .executeTakeFirst();

      if (!result) {
        const exists = await tx
          .selectFrom('runs')
          .select([])
          .where('id', '=', runId)
          .executeTakeFirst();
        if (exists) {
          return undefined;
        }
        throw new RunNotFoundError(runId);
      }

      await sql`
                UPDATE runs
                SET 
                    status = ${WorkflowStatus.CANCELLED},
                    updated_at = (extract(epoch from now()) * 1000)::bigint
                WHERE path @> ARRAY[${runId}]::text[]
                AND id != ${runId}
                AND status NOT IN (${WorkflowStatus.CANCELLED}, ${WorkflowStatus.SUCCESS}, ${WorkflowStatus.ERROR})
            `.execute(tx);

      return {
        path: result.path,
      };
    });
  });
}
