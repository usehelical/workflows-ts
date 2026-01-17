import { Kysely } from 'kysely';
import { getWorkflowStore } from './internal/store';
import { Workflow } from './workflow';
import { subscriptionToAsyncIterator } from './internal/utils/subscription-iterator';
import { ClientStore } from './internal/client-store';

const GET_STATE_OPERATION_NAME = 'fida::get-state';
const SET_STATE_OPERATION_NAME = 'fida::set-state';

export interface StateDefinition<T> {
  name: string;
  data?: T;
}

export function defineState<T>(name: string) {
  return {
    name,
  } as StateDefinition<T>;
}

export async function getStateOperation<T = unknown>(
  wf: Workflow | string,
  key: StateDefinition<T> | string,
) {
  const stateKey = typeof key === 'string' ? key : key.name;
  const stateWorkflowId = typeof wf === 'string' ? wf : wf.id;
  const { operationManager, stateEventBus } = getWorkflowStore();

  const handleStateUpdate = (callback: (state: T) => void) => (data: T) => {
    operationManager
      .runOperationAndRecordResult(GET_STATE_OPERATION_NAME, async () => {
        return data;
      })
      .then((state) => {
        callback(state);
      })
      .catch((err) => {
        console.error('Error processing state update:', err);
      });
  };

  const getFirstState = async () => {
    return await operationManager.runOperationAndRecordResult(
      GET_STATE_OPERATION_NAME,
      async (tx) => {
        const state = await retrieveState(tx, stateWorkflowId, stateKey);
        return state;
      },
    );
  };

  return (async function* () {
    const state = await getFirstState();
    if (state) {
      yield state;
    }

    yield* subscriptionToAsyncIterator((callback) => {
      return stateEventBus.subscribe(stateWorkflowId, stateKey, handleStateUpdate(callback));
    });
  })();
}

export async function getState<T = unknown>(
  store: ClientStore,
  wf: Workflow | string,
  key: StateDefinition<T> | string,
) {
  const workflowId = typeof wf === 'string' ? wf : wf.id;
  const stateKey = typeof key === 'string' ? key : key.name;
  return (async function* () {
    yield await retrieveState(store.db, workflowId, stateKey);
    yield* subscriptionToAsyncIterator((callback) => {
      return store.stateEventBus.subscribe(workflowId, stateKey, callback);
    });
  })();
}

async function retrieveState(db: Kysely<any>, workflowId: string, key: string) {
  const [{ value }] = await db
    .selectFrom('workflow_contexts')
    .select('value')
    .where('workflow_id', '=', workflowId)
    .where('key', '=', key)
    .execute();
  return value;
}

export async function setStateOperation<T = unknown>(state: StateDefinition<T> | string, value: T) {
  const stateKey = typeof state === 'string' ? state : state.name;
  const { operationManager, workflowId } = getWorkflowStore();
  await operationManager.runOperationAndRecordResult(SET_STATE_OPERATION_NAME, async (tx) => {
    await tx
      .insertInto('workflow_contexts')
      .values({
        workflow_id: workflowId,
        key: stateKey,
        value: JSON.stringify(value),
      })
      .execute();
    return value;
  });
}
