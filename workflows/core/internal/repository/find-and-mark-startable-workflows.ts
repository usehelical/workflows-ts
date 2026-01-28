import { WorkflowStatus } from '../../workflow';
import { Database, Transaction } from '../db/client';

export async function findAndMarkStartableWorkflows(
  tx: Database | Transaction,
  queueName: string,
  slots?: number,
) {
  return await tx
    .selectFrom('runs')
    .selectAll()
    .where('status', '=', WorkflowStatus.PENDING)
    .where('queue_name', '=', queueName)
    .$if(slots !== undefined, (qb) => qb.limit(slots!))
    .execute();
}
