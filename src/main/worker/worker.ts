/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'node:crypto';
import { QueueDefinition } from '@api/queue';
import { WorkflowDefinition } from '@api/workflow';
import { StateEventBus } from '@internal/events/state-event-bus';
import { MessageEventBus } from '@internal/events/message-event-bus';
import { runWorkflow, RunWorkflowOptions } from '@internal/run-workflow';
import { RunRegistry } from '@internal/context/run-registry';
import { recoverPendingRuns } from '@internal/recover-pending-runs';
import { RuntimeContext } from '@internal/context/runtime-context';
import { RunEventBus } from '@internal/events/run-event-bus';
import { createRunHandle, Run, RunResult } from '../../internal/run';
import { cancelRun } from '@internal/cancel-run';
import { queueWorkflow, QueueWorkflowOptions } from '@internal/queue-workflow';
import { QueueManager } from '@internal/context/queue-manager';
import { setupPostgresNotify } from '@internal/events/setup-postgres-notify';
import { createPgDriver } from '@internal/db/driver-pg';
import { resumeRun } from '@internal/resume-run';
import { MessageDefinition } from '@api/message';
import { sendMessage } from '@internal/send-message';
import { StateDefinition } from '@api/state';
import { getState } from '@internal/get-state';
import { getRunStatus } from '@internal/get-run-status';
import { waitForRunResult } from '@internal/wait-for-run-result';

type CreateInstanceOptions = {
  instanceId?: string;
  connectionString: string;
};

export type createWorkerParams<
  TWorkflows extends Record<string, WorkflowDefinition<unknown[], unknown>>,
  TQueues extends Record<string, QueueDefinition>,
> = {
  workflows: TWorkflows;
  queues?: TQueues;
  options: CreateInstanceOptions;
};

export interface WorkflowOperations<
  TWorkflows extends Record<string, WorkflowDefinition<unknown[], unknown>>,
  TQueues extends Record<string, QueueDefinition>,
> {
  // queueWorkflow overloads
  queueWorkflow<
    QName extends keyof TQueues,
    WName extends keyof TWorkflows,
    TArgs extends unknown[] = TWorkflows[WName] extends WorkflowDefinition<
      infer A extends unknown[],
      unknown
    >
      ? A
      : never,
    TReturn = TWorkflows[WName] extends WorkflowDefinition<unknown[], infer R> ? R : never,
  >(
    queueName: QName,
    workflowName: WName,
    args: TArgs,
    options?: QueueWorkflowOptions,
  ): Promise<Run<TReturn>>;

  queueWorkflow<
    QName extends keyof TQueues,
    WName extends keyof TWorkflows,
    TReturn = TWorkflows[WName] extends WorkflowDefinition<unknown[], infer R> ? R : never,
  >(
    queueName: QName,
    workflowName: WName,
    options: QueueWorkflowOptions,
  ): Promise<Run<TReturn>>;

  queueWorkflow<
    QName extends keyof TQueues,
    WName extends keyof TWorkflows,
    TReturn = TWorkflows[WName] extends WorkflowDefinition<unknown[], infer R> ? R : never,
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

export interface Worker<
  TWorkflows extends Record<string, WorkflowDefinition<unknown[], unknown>>,
  TQueues extends Record<string, QueueDefinition>,
> extends WorkflowOperations<TWorkflows, TQueues> {
  // Worker-specific: runWorkflow overloads
  runWorkflow<
    WName extends keyof TWorkflows,
    TArgs extends unknown[] = TWorkflows[WName] extends WorkflowDefinition<
      infer A extends unknown[],
      unknown
    >
      ? A
      : never,
    TReturn = TWorkflows[WName] extends WorkflowDefinition<unknown[], infer R> ? R : never,
  >(
    workflowName: WName,
    args: TArgs,
    options?: RunWorkflowOptions,
  ): Promise<Run<TReturn>>;

  runWorkflow<
    WName extends keyof TWorkflows,
    TReturn = TWorkflows[WName] extends WorkflowDefinition<unknown[], infer R> ? R : never,
  >(
    workflowName: WName,
    options: RunWorkflowOptions,
  ): Promise<Run<TReturn>>;

  runWorkflow<
    WName extends keyof TWorkflows,
    TReturn = TWorkflows[WName] extends WorkflowDefinition<unknown[], infer R> ? R : never,
  >(
    workflowName: WName,
  ): Promise<Run<TReturn>>;
}

export function createWorker<
  TWorkflows extends Record<string, WorkflowDefinition<any[], any>>,
  TQueues extends Record<string, QueueDefinition>,
>(props: createWorkerParams<TWorkflows, TQueues>): Worker<TWorkflows, TQueues> {
  const { db, client } = createPgDriver({ connectionString: props.options.connectionString });
  const messageEventBus = new MessageEventBus(db);
  const stateEventBus = new StateEventBus(db);
  const executorId = props.options.instanceId || crypto.randomUUID();
  const runRegistry = new RunRegistry();
  const runEventBus = new RunEventBus(db);

  const workflowsMap = props.workflows as Record<string, WorkflowDefinition<unknown[], unknown>>;

  const runtimeContext: RuntimeContext = {
    type: 'runtime',
    db,
    executorId,
    messageEventBus,
    stateEventBus,
    runRegistry,
    workflowsMap,
    queueRegistry: props.queues || {},
    runEventBus,
  };

  const notifySetupPromise = setupPostgresNotify(client, {
    runs: runEventBus.handleNotify.bind(runEventBus),
    state: stateEventBus.handleNotify.bind(stateEventBus),
    messages: messageEventBus.handleNotify.bind(messageEventBus),
  });

  const queueManager = new QueueManager(runtimeContext);
  queueManager.start();

  recoverPendingRuns(runtimeContext);

  return {
    runWorkflow: async <TArgs extends unknown[] = unknown[], TReturn = unknown>(
      workflowName: string,
      argsOrOptions?: TArgs | RunWorkflowOptions,
      options?: RunWorkflowOptions,
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
      return runWorkflow<TArgs, TReturn>(runtimeContext, workflowName, args, opts);
    },
    queueWorkflow: async (
      queueName: string,
      workflowName: string,
      argsOrOptions?: unknown[] | QueueWorkflowOptions,
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
      return queueWorkflow(runtimeContext, queueName, workflowName, args, opts);
    },
    getRun: async (runId: string) => {
      await notifySetupPromise;
      return createRunHandle(runtimeContext, runId);
    },
    waitForRunResult: async (runId: string) => {
      await notifySetupPromise;
      return waitForRunResult(runtimeContext, runId);
    },
    cancelRun: async (runId: string) => cancelRun(runtimeContext, runId),
    resumeRun: async (runId: string) => resumeRun(runtimeContext, runId),
    getRunStatus: async (runId: string) => getRunStatus(runtimeContext, runId),
    sendMessage: async <T>(target: Run | string, name: MessageDefinition<T>, data: T) => {
      await notifySetupPromise;
      return sendMessage(runtimeContext, target, name, data);
    },
    getState: async <T>(target: Run | string, key: StateDefinition<T>) => {
      await notifySetupPromise;
      return getState<T>(runtimeContext, target, key);
    },
  };
}

export type Instance = ReturnType<typeof createWorker>;
