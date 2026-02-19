/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPgDriver } from '@internal/db/driver-pg';
import { MessageEventBus } from '@internal/events/message-event-bus';
import { StateEventBus } from '@internal/events/state-event-bus';
import { RunEventBus } from '@internal/events/run-event-bus';
import { ClientContext } from '@internal/context/client-context';
import { setupPostgresNotify } from '@internal/events/setup-postgres-notify';
import { cancelRun } from '@internal/cancel-run';
import { resumeRun } from '@internal/resume-run';
import { createRunHandle, Run, RunResult } from '../../internal/run';
import { getRunStatus } from '@internal/get-run-status';
import { waitForRunResult } from '@internal/wait-for-run-result';
import { queueWorkflow, QueueWorkflowOptions } from '@internal/queue-workflow';
import { MessageDefinition } from '@api/message';
import { sendMessage } from '@internal/send-message';
import { StateDefinition } from '@api/state';
import { getState } from '@internal/get-state';
import { WorkflowDefinition } from '@api/workflow';
import { Worker } from '../worker';

type ExtractWorkflowNames<T> =
  T extends Worker<infer W, any>
    ? W extends ReadonlyArray<infer Item>
      ? Item extends { name: infer Name extends string }
        ? Name
        : never
      : never
    : never;

type ExtractQueueNames<T> =
  T extends Worker<any, infer Q>
    ? Q extends Array<infer Item>
      ? Item extends { name: infer Name }
        ? Name
        : never
      : never
    : never;

type GetWorkflowByName<TWorker, Name extends string> =
  TWorker extends Worker<infer W, any> ? Extract<W[number], { name: Name }> : never;

export interface Client<TWorker extends Worker<any, any>> {
  // queueWorkflow overloads
  queueWorkflow<
    QName extends ExtractQueueNames<TWorker>,
    WName extends ExtractWorkflowNames<TWorker>,
    TWorkflow extends WorkflowDefinition<any, any> = GetWorkflowByName<TWorker, WName>,
    TArgs extends unknown[] = TWorkflow extends WorkflowDefinition<infer A, unknown> ? A : never,
    TReturn = TWorkflow extends WorkflowDefinition<unknown[], infer R> ? R : never,
  >(
    queueName: QName,
    workflowName: WName,
    args: TArgs,
    options?: QueueWorkflowOptions,
  ): Promise<Run<TReturn>>;

  queueWorkflow<
    QName extends ExtractQueueNames<TWorker>,
    WName extends ExtractWorkflowNames<TWorker>,
    TWorkflow extends WorkflowDefinition<any, any> = GetWorkflowByName<TWorker, WName>,
    TReturn = TWorkflow extends WorkflowDefinition<unknown[], infer R> ? R : never,
  >(
    queueName: QName,
    workflowName: WName,
    options: QueueWorkflowOptions,
  ): Promise<Run<TReturn>>;

  queueWorkflow<
    QName extends ExtractQueueNames<TWorker>,
    WName extends ExtractWorkflowNames<TWorker>,
    TWorkflow extends WorkflowDefinition<any, any> = GetWorkflowByName<TWorker, WName>,
    TReturn = TWorkflow extends WorkflowDefinition<unknown[], infer R> ? R : never,
  >(
    queueName: QName,
    workflowName: WName,
  ): Promise<Run<TReturn>>;

  // Shared methods
  cancelRun(runId: string): Promise<void>;
  resumeRun(runId: string): Promise<void>;
  getRun<TWorkflow extends WorkflowDefinition<unknown[], unknown>>(
    runId: string,
  ): Promise<Run<TWorkflow extends WorkflowDefinition<unknown[], infer R> ? R : never>>;
  getRun<TReturn>(runId: string): Promise<Run<TReturn>>;
  getRunStatus(runId: string): Promise<string>;
  waitForRunResult<TWorkflow extends WorkflowDefinition<unknown[], unknown>>(
    runId: string,
  ): Promise<RunResult<TWorkflow extends WorkflowDefinition<unknown[], infer R> ? R : never>>;
  waitForRunResult<TReturn>(runId: string): Promise<RunResult<TReturn>>;
  sendMessage<T>(target: Run | string, name: MessageDefinition<T>, data: T): Promise<void>;
  getState<T>(target: Run | string, key: StateDefinition<T> | string): Promise<T | undefined>;
}

type ClientOptions = {
  connectionString: string;
};

export function createClient<TWorker extends Worker<any, any>>(
  options: ClientOptions,
): Client<TWorker> {
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

  return {
    queueWorkflow: async <TArgs extends unknown[], TReturn>(
      queueName: string,
      workflowName: string,
      argsOrOptions?: TArgs | QueueWorkflowOptions,
      options?: QueueWorkflowOptions,
    ) => {
      await notifySetupPromise;
      let args, opts;
      if (argsOrOptions !== undefined) {
        if (Array.isArray(argsOrOptions)) {
          args = argsOrOptions;
          opts = options;
        } else {
          opts = argsOrOptions;
        }
      }
      return queueWorkflow<TArgs, TReturn>(clientContext, queueName, workflowName, args, opts);
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
