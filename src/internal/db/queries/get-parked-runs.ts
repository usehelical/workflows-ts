import { Database } from '../db';
import { TERMINAL_STATES } from '@api/workflow';
import { listLiveVersions } from './list-live-versions';

export type ParkedRunSummary = {
  appVersion: string;
  count: number;
};

/**
 * Returns counts of non-terminal runs grouped by app_version, filtered to
 * versions that have no live worker heartbeat within the freshness window.
 *
 * A non-zero count for a version means runs are parked — they will not make
 * progress until a worker with that app_version starts up.
 *
 * Use this as a drain signal: when count == 0 for a given version it is safe
 * to retire workers serving it.
 *
 * @param freshnessMs - Heartbeat freshness window in ms (default 2× lease TTL).
 */
export async function getParkedRuns(
  db: Database,
  freshnessMs: number = 60_000,
): Promise<ParkedRunSummary[]> {
  const liveVersions = await listLiveVersions(db, freshnessMs);

  const rows = await db
    .selectFrom('runs')
    .select([
      'app_version',
      (eb) => eb.fn.count<number>('id').as('count'),
    ])
    .where('status', 'not in', TERMINAL_STATES)
    .where('app_version', 'is not', null)
    .$if(liveVersions.length > 0, (qb) => qb.where('app_version', 'not in', liveVersions))
    .groupBy('app_version')
    .execute();

  return rows.map((r) => ({
    appVersion: r.app_version!,
    count: Number(r.count),
  }));
}
