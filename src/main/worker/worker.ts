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
  TWorkflows extends Array<WorkflowDefinition<any, any>>,
  TQueues extends Array<QueueDefinition>,
> = {
  workflows: TWorkflows;
  queues?: TQueues;
  options: CreateInstanceOptions;
};

export interface Worker<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TWorkflows extends ReadonlyArray<WorkflowDefinition<any, any>>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TQueues extends ReadonlyArray<QueueDefinition>,
> {
  // Worker-specific: runWorkflow overloads
  runWorkflow<TArgs extends unknown[], TReturn>(
    workflowDefinition: WorkflowDefinition<TArgs, TReturn>,
    options: RunWorkflowOptions,
  ): Promise<Run<TReturn>>;

  // Then the general one
  runWorkflow<TArgs extends unknown[], TReturn>(
    workflowDefinition: WorkflowDefinition<TArgs, TReturn>,
    args?: TArgs,
    options?: RunWorkflowOptions,
  ): Promise<Run<TReturn>>;

  // queueWorkflow overloads
  queueWorkflow<TArgs extends unknown[], TReturn = unknown>(
    queue: QueueDefinition,
    workflow: WorkflowDefinition<TArgs, TReturn>,
    args: TArgs,
    options?: QueueWorkflowOptions,
  ): Promise<Run<TReturn>>;

  queueWorkflow<TArgs extends unknown[], TReturn = unknown>(
    queue: QueueDefinition,
    workflow: WorkflowDefinition<TArgs, TReturn>,
    options: QueueWorkflowOptions,
  ): Promise<Run<TReturn>>;

  queueWorkflow<TArgs extends unknown[], TReturn = unknown>(
    queue: QueueDefinition,
    workflow: WorkflowDefinition<TArgs, TReturn>,
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
  sendMessage<T>(runId: string, name: MessageDefinition<T>, data: T): Promise<void>;
  getState<T>(runId: string, key: StateDefinition<T> | string): Promise<T | undefined>;
}

export function createWorker<
  TWorkflows extends Array<WorkflowDefinition<any, any>>,
  TQueues extends Array<QueueDefinition>,
>(props: createWorkerParams<TWorkflows, TQueues>): Worker<TWorkflows, TQueues> {
  const { db, client } = createPgDriver({ connectionString: props.options.connectionString });
  const messageEventBus = new MessageEventBus(db);
  const stateEventBus = new StateEventBus(db);
  const executorId = props.options.instanceId || crypto.randomUUID();
  const runRegistry = new RunRegistry();
  const runEventBus = new RunEventBus(db);

  const workflowsMap = props.workflows.reduce(
    (acc, workflow) => {
      acc[workflow.name] = workflow;
      return acc;
    },
    {} as Record<string, WorkflowDefinition<unknown[], unknown>>,
  );

  const runtimeContext: RuntimeContext = {
    type: 'runtime',
    db,
    executorId,
    messageEventBus,
    stateEventBus,
    runRegistry,
    workflowsMap,
    queueRegistry: props.queues || [],
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
      workflow: WorkflowDefinition<TArgs, TReturn>,
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
      return runWorkflow<TArgs, TReturn>(runtimeContext, workflow.name, args, opts);
    },
    queueWorkflow: async (
      queue: QueueDefinition,
      workflow: WorkflowDefinition<any[], any>,
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
      return queueWorkflow(runtimeContext, queue.name, workflow.name, args, opts);
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
