import { sql } from 'kysely';
import { Database } from '../db';
import { RunNotFoundError } from '../../errors';
import { TERMINAL_STATES } from '@api/workflow';

export async function cancelRun(runId: string, db: Database, options: { cascade?: boolean } = {}) {
  if (options.cascade) {
    return db.transaction().execute(async (tx) => {
      const result = await tx
        .updateTable('runs')
        .set({
          status: 'cancelled',
          updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
        })
        .where((eb) => eb.and([eb('id', '=', runId), eb('status', 'not in', TERMINAL_STATES)]))
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
              status = ${'cancelled'},
              updated_at = (extract(epoch from now()) * 1000)::bigint
          WHERE path @> ARRAY[${runId}]::text[]
          AND id != ${runId}
          AND status NOT IN (${'cancelled'}, ${'success'}, ${'error'})
      `.execute(tx);

      return {
        path: result.path,
        changeId: result.change_id,
      };
    });
  } else {
    const result = await db
      .updateTable('runs')
      .set({
        status: 'cancelled',
        updated_at: sql`(extract(epoch from now()) * 1000)::bigint`,
      })
      .where((eb) => eb.and([eb('id', '=', runId), eb('status', 'not in', TERMINAL_STATES)]))
      .returning(['path', 'change_id'])
      .executeTakeFirst();

    if (!result) {
      throw new RunNotFoundError(runId);
    }
    return {
      path: result.path,
      changeId: result.change_id,
    };
  }
}
