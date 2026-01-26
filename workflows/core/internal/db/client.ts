import { Kysely, PostgresDialect, Transaction as KyselyTransaction } from 'kysely';
import { Pool } from 'pg';
import { DB } from './types';

export type DatabaseConfig = {
  connectionString: string;
};

export function createDbClient(config: DatabaseConfig) {
  const dialect = new PostgresDialect({
    pool: new Pool({
      connectionString: config.connectionString,
      max: 10,
    }),
  });
  return new Kysely<DB>({
    dialect,
  });
}

export type Database = Kysely<DB>;

export type Transaction = KyselyTransaction<DB>;
