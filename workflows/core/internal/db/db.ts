import { Kysely, Transaction as KyselyTransaction } from 'kysely';
import { DB } from './types';

export type Database = Kysely<DB>;

export type Transaction = KyselyTransaction<DB>;
