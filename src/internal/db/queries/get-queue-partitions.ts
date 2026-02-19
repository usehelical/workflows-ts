import { Database } from '../db';

export async function getQueuePartitions(db: Database, queueName: string): Promise<string[]> {
  const result = await db
    .selectFrom('runs')
    .select('queue_partition_key')
    .distinct()
    .where('queue_name', '=', queueName)
    .where('status', '=', 'queued')
    .where('queue_partition_key', 'is not', null)
    .execute();
  return result.map((row) => row.queue_partition_key!);
}
