import { Database } from '../db';
import { StateRetrievalRequest } from '../../events/state-event-bus';

export async function getStateBatch(db: Database, stateRetrievalRequests: StateRetrievalRequest) {
  const results = await db
    .selectFrom('state')
    .select(['key', 'value', 'change_id', 'run_id', 'change_id'])
    .where(
      'run_id',
      'in',
      stateRetrievalRequests.map((r) => r.runId),
    )
    .where(
      'key',
      'in',
      stateRetrievalRequests.map((r) => r.key),
    )
    .execute();
  return results.map((r) => ({
    runId: r.run_id,
    key: r.key,
    value: r.value,
    changeId: r.change_id,
  }));
}
