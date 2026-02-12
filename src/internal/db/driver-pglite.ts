import { PGlite } from '@electric-sql/pglite';
import { Kysely } from 'kysely';
import { KyselyPGlite } from 'kysely-pglite';
import { DB } from './types';

export function createPgLiteDriver(pgLite: PGlite) {
  const { dialect } = new KyselyPGlite(pgLite);
  return {
    client: {
      listen: async (channel: string, callback: (payload: string | undefined) => void) => {
        await pgLite.listen(channel, (payload) => {
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
