import { sql } from 'kysely';
import { Database } from '../db';

export async function upsertWorker(db: Database, workerId: string, appVersion: string) {
  const now = sql<string>`(extract(epoch from now()) * 1000)::bigint`;
  await db
    .insertInto('workers')
    .values({
      id: workerId,
      app_version: appVersion,
      last_heartbeat_epoch_ms: now,
    })
    .onConflict((oc) =>
      oc.column('id').doUpdateSet({
        app_version: appVersion,
        last_heartbeat_epoch_ms: now,
      }),
    )
    .execute();
}
