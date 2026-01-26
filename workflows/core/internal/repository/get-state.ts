import { Database } from '../db/client';

export async function getState(db: Database, runId: string, key: string) {
  return {
    key,
    data: 'data',
    changeId: 1,
  };
}
