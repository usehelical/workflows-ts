import { Database, Transaction } from '../db/db';

type InsertMessageOptions = {
  destinationWorkflowId: string;
  messageType: string;
  data: string;
};

export async function insertMessage(db: Database | Transaction, options: InsertMessageOptions) {
  return await db
    .insertInto('messages')
    .values({
      destination_run_id: options.destinationWorkflowId,
      type: options.messageType,
      payload: options.data,
    })
    .execute();
}
