import { Transaction } from 'kysely';

interface QueueConfig {
  name: string;
  workerConcurrency?: number;
  priorityEnabled?: boolean;
}

interface QueueInstance {
  name: string;
  availableSlots: number;
}

// listen on the notify status channel for queued workflows filter to only accept registered queues and registered workflows
// listen on the in-memory event bus for newly enqueued workflows filter to only accept registered queues and registered workflows
// How can I deduplicate the events from the notify event bus and the in-memory event bus?

// onEvent do findAndMarkStartableWorkflows and start them (throttl)

// QueueManager should listen on the notify event bus
// and on the memory event bus for newly enqueued workflows and start them
// (notify event bus and memory event bus should be deduplicated smh)

async function findAndMarkStartableWorkflows(
  tx: Transaction<any>,
  queueName: string,
  slots: number,
  priorityEnabled?: boolean,
) {
  return await tx
    .selectFrom('workflows')
    .where('status', '=', 'PENDING')
    .where('queue_name', '=', queueName)
    .orderBy('priority', 'desc')
    .limit(slots)
    .execute();
}

async function startWorkflows(
  tx: Transaction<any>,
  workflowIds: string[],
  executorId: string,
): Promise<void> {
  await tx
    .updateTable('workflows')
    .set({ status: 'STARTED', executor_id: executorId, started_at_epoch_ms: Date.now() })
    .where('workflow_id', 'in', workflowIds)
    .execute();
}
