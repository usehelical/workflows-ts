import { Database } from './db/client';
import { MessageEventBus } from './events/message-event-bus';
import { RunEventBus } from './events/run-event-bus';
import { StateEventBus } from './events/state-event-bus';
import { QueueRegistry } from './queue-registry';
import { RunRegistry } from './run-registry';
import { WorkflowRegistry } from './workflow-registry';

export interface RuntimeContext {
  db: Database;
  executorId: string;
  messageEventBus: MessageEventBus;
  stateEventBus: StateEventBus;
  runEventBus: RunEventBus;
  runRegistry: RunRegistry;
  workflowRegistry: WorkflowRegistry;
  queueRegistry: QueueRegistry;
}
