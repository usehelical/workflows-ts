import { Database } from '@internal/db/db';
import { MessageEventBus } from '@internal/events/message-event-bus';
import { RunEventBus } from '@internal/events/run-event-bus';
import { StateEventBus } from '@internal/events/state-event-bus';

export interface ClientContext {
  type: 'client';
  db: Database;
  messageEventBus: MessageEventBus;
  stateEventBus: StateEventBus;
  runEventBus: RunEventBus;
}
