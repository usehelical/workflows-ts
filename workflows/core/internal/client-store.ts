import { Kysely } from 'kysely';
import { MessageEventBus } from './events/message-event-bus';
import { StateEventBus } from './events/state-event-bus';

export interface ClientStore {
  stateEventBus: StateEventBus;
  messageEventBus: MessageEventBus;
  db: Kysely<any>;
}
