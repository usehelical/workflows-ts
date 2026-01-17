import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

export function createDbClient() {
  const dialect = new PostgresDialect({
    pool: new Pool({
      database: 'test',
      host: 'localhost',
      user: 'admin',
      port: 5434,
      max: 10,
    }),
  });
  return new Kysely({
    dialect,
  });
}
