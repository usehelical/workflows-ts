import { Kysely, PostgresDialect } from 'kysely';
import { Pool, PoolClient } from 'pg';
import { DB } from './types';
import { Database } from './db';

export interface Client {
  listen(channel: string, callback: (payload: string | undefined) => void): Promise<void>;
  query(query: string): Promise<void>;
}

export interface DbDriver {
  client: Client;
  db: Database;
}

export function createPgDriver({ connectionString }: { connectionString: string }): DbDriver {
  const pool = new Pool({
    connectionString: connectionString,
    max: 10,
  });
  let clientPromise: Promise<PoolClient> | undefined;
  const getClient = async () => {
    if (!clientPromise) {
      clientPromise = pool.connect();
    }
    return await clientPromise;
  };
  return {
    client: {
      listen: async (channel: string, callback: (payload: string | undefined) => void) => {
        const client = await getClient();
        client.on('notification', (msg) => {
          if (msg.channel !== channel) return;
          callback(msg.payload);
        });
      },
      query: async (query: string) => {
        const client = await getClient();
        await client.query(query);
      },
    },
    db: new Kysely<DB>({ dialect: new PostgresDialect({ pool }) }),
  };
}
