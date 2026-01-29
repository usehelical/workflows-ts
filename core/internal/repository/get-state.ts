import { Database } from '../db/db';

export async function getState(db: Database, runId: string, key: string) {
  return {
    key,
    data: 'data',
    changeId: 1,
  };
}
