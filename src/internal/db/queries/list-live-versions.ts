import { Database } from '../db';

/**
 * Returns the set of app_versions with a live worker heartbeat within the
 * given freshness window. Used to detect parked runs whose version has no
 * active worker and to compute drain signals.
 */
export async function listLiveVersions(db: Database, freshnessMs: number): Promise<string[]> {
  const cutoffMs = Date.now() - freshnessMs;

  const rows = await db
    .selectFrom('workers')
    .select('app_version')
    .where('last_heartbeat_epoch_ms', '>', cutoffMs.toString())
    .distinct()
    .execute();

  return rows.map((r) => r.app_version);
}
