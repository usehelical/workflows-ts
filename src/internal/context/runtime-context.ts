import { WorkflowDefinition } from '@api/workflow';
import { Database } from '../db/db';
import { MessageEventBus } from '../events/message-event-bus';
import { RunEventBus } from '../events/run-event-bus';
import { StateEventBus } from '../events/state-event-bus';
import { RunRegistry } from './run-registry';
import { QueueDefinition } from '@api/queue';

export interface RuntimeContext {
  type: 'runtime';
  db: Database;
  executorId: string;
  messageEventBus: MessageEventBus;
  stateEventBus: StateEventBus;
  runEventBus: RunEventBus;
  runRegistry: RunRegistry;
  workflowsMap: Record<string, WorkflowDefinition<unknown[], unknown>>;
  queueRegistry: Record<string, QueueDefinition>;
}
