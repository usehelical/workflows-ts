/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPgDriver } from '@internal/db/driver-pg';
import { MessageEventBus } from '@internal/events/message-event-bus';
import { StateEventBus } from '@internal/events/state-event-bus';
import { RunEventBus } from '@internal/events/run-event-bus';
import { ClientContext } from '@internal/context/client-context';
import { setupPostgresNotify } from '@internal/events/setup-postgres-notify';
import { cancelRun } from '@internal/cancel-run';
import { resumeRun } from '@internal/resume-run';
import { createRunHandle } from '../../internal/run';
import { getRunStatus } from '@internal/get-run-status';
import { waitForRunResult } from '@internal/wait-for-run-result';
import { queueWorkflow, QueueWorkflowOptions } from '@internal/queue-workflow';
import { MessageDefinition } from '@api/message';
import { sendMessage } from '@internal/send-message';
import { StateDefinition } from '@api/state';
import { getState } from '@internal/get-state';
import { WorkflowDefinition, WorkflowSignature } from '@api/workflow';
import { QueueDefinition, QueueSignature } from '@api/queue';
import { Executor, WorkflowOperations } from '../executor';

type ExtractWorkflows<T> = T extends Executor<infer W, any> ? W : never;

type ExtractQueues<T> = T extends Executor<any, infer Q> ? Q : never;

type QueuesProxy<TQueues extends Record<string, QueueDefinition>> = {
  [K in keyof TQueues]: {
    name: K;
    definition: TQueues[K];
  };
};

type WorkflowsProxy<TWorkflows extends Record<string, WorkflowDefinition<unknown[], unknown>>> = {
  [K in keyof TWorkflows]: {
    name: K;
    definition: TWorkflows[K];
  };
};

interface Client<
  TWorkflows extends Record<string, WorkflowDefinition<unknown[], unknown>>,
  TQueues extends Record<string, QueueDefinition>,
> extends WorkflowOperations<ExtractWorkflows<TWorkflows>, ExtractQueues<TQueues>> {
  workflows: WorkflowsProxy<TWorkflows>;
  queues: QueuesProxy<TQueues>;
}

type ClientOptions = {
  connectionString: string;
};

export function createClient<TExecutor extends Executor<any, any>>(
  options: ClientOptions,
): Client<ExtractWorkflows<TExecutor>, ExtractQueues<TExecutor>> {
  const { db, client } = createPgDriver({ connectionString: options.connectionString });
  const messageEventBus = new MessageEventBus(db);
  const stateEventBus = new StateEventBus(db);
  const runEventBus = new RunEventBus(db);

  const clientContext: ClientContext = {
    type: 'client',
    db,
    messageEventBus,
    stateEventBus,
    runEventBus,
  };

  const notifySetupPromise = setupPostgresNotify(client, {
    runs: runEventBus.handleNotify.bind(runEventBus),
    state: stateEventBus.handleNotify.bind(stateEventBus),
    messages: messageEventBus.handleNotify.bind(messageEventBus),
  });

  const workflows = new Proxy({} as any, {
    get(_target, prop: string) {
      return {
        name: prop,
        // Could include type metadata if needed
      };
    },
  });

  const queues = new Proxy({} as any, {
    get(_target, prop: string) {
      return {
        name: prop,
        // Could include type metadata if needed
      };
    },
  });

  return {
    workflows,
    queues,
    queueWorkflow: async <TArgs extends unknown[], TReturn>(
      queue: QueueSignature,
      wf: WorkflowSignature<TArgs, TReturn>,
      args?: TArgs,
      options?: QueueWorkflowOptions,
    ) => {
      await notifySetupPromise;
      return queueWorkflow<TArgs, TReturn>(clientContext, queue.name, wf.name, args, options);
    },
    cancelRun: async (runId: string) => cancelRun(clientContext, runId),
    resumeRun: async (runId: string) => resumeRun(clientContext, runId),
    getRun: async (runId: string) => {
      await notifySetupPromise;
      return createRunHandle(clientContext, runId);
    },
    getRunStatus: async (runId: string) => getRunStatus(clientContext, runId),
    waitForRunResult: async <TReturn>(runId: string) =>
      waitForRunResult<TReturn>(clientContext, runId),
    sendMessage: async <T>(runId: string, name: MessageDefinition<T>, data: T) => {
      await notifySetupPromise;
      return sendMessage(clientContext, runId, name, data);
    },
    getState: async <T>(runId: string, key: StateDefinition<T> | string) => {
      await notifySetupPromise;
      return getState<T>(clientContext, runId, key);
    },
  };
}
