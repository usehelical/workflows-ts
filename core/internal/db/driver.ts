import { PGlite } from '@electric-sql/pglite';
import { Kysely, PostgresDialect } from 'kysely';
import { KyselyPGlite } from 'kysely-pglite';
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

export function createPgLiteDriver(pgLite: PGlite) {
  const { dialect } = new KyselyPGlite(pgLite);
  return {
    client: {
      listen: async (channel: string, callback: (payload: string | undefined) => void) => {
        await pgLite.listen(channel, (payload) => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'driver.ts:54',
              message: 'PGlite notify received, calling callback',
              data: { channel, payload, callbackType: typeof callback },
              timestamp: Date.now(),
              sessionId: 'debug-session',
              hypothesisId: 'D',
            }),
          }).catch(() => {});
          // #endregion
          callback(payload);
        });
      },
      query: async (query: string) => {
        await pgLite.query(query);
      },
    },
    db: new Kysely<DB>({ dialect }),
  };
}
