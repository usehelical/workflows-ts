import crypto from 'node:crypto';
import { QueueEntry } from '../core/queue';
import { WorkflowEntry } from '../core/workflow';
import { StateEventBus } from '../core/internal/events/state-event-bus';
import { MessageEventBus } from '../core/internal/events/message-event-bus';
import { runWorkflow, RunWorkflowOptions } from './run-workflow';
import { RunRegistry } from '../core/internal/run-registry';
import { recoverPendingRuns } from '../core/internal/recover-pending-runs';
import { RuntimeContext } from '../core/internal/runtime-context';
import { WorkflowRegistry } from '../core/internal/workflow-registry';
import { RunEventBus } from '../core/internal/events/run-event-bus';
import { createRunHandle, Run } from './run';
import { QueueRegistry } from '../core/internal/queue-registry';
import { cancelRun } from './cancel-run';
import { queueWorkflow, QueueWorkflowOptions } from './queue-workflow';
import { QueueManager } from '../core/internal/queue-manager';
import { setupPostgresNotify } from '../core/internal/events/setup-postgres-notify';
import { createPgDriver } from '../core/internal/db/driver-pg';
import { resumeRun } from './resume-run';
import { MessageDefinition } from '../core/message';
import { sendMessage } from './send-message';
import { StateDefinition } from '../core/state';
import { getState } from './get-state';
import { getRunStatus } from './get-run-status';
import { waitForRunResult } from './wait-for-run-result';

type CreateInstanceOptions = {
  instanceId?: string;
  connectionString: string;
};

export type CreateInstanceParams = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflows: Record<string, WorkflowEntry<any, any>>;
  queues?: Record<string, QueueEntry>;
  options: CreateInstanceOptions;
};

export function createInstance(props: CreateInstanceParams) {
  const { db, client } = createPgDriver({ connectionString: props.options.connectionString });
  const messageEventBus = new MessageEventBus(db);
  const stateEventBus = new StateEventBus(db);
  const executorId = props.options.instanceId || crypto.randomUUID();
  const runRegistry = new RunRegistry();
  const workflowRegistry = new WorkflowRegistry(props.workflows);
  const runEventBus = new RunEventBus(db);
  const queueRegistry = new QueueRegistry(props.queues || {});

  const runtimeContext: RuntimeContext = {
    db,
    executorId,
    messageEventBus,
    stateEventBus,
    runRegistry,
    workflowRegistry,
    runEventBus,
    queueRegistry,
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
    runWorkflow: async <TArgs extends unknown[], TReturn>(
      wf: WorkflowEntry<TArgs, TReturn> | string,
      args?: TArgs,
      options?: RunWorkflowOptions,
    ) => {
      await notifySetupPromise;
      return runWorkflow<TArgs, TReturn>(runtimeContext, wf, args, options);
    },
    cancelRun: async (runId: string) => cancelRun(runtimeContext, runId),
    resumeRun: async (runId: string) => resumeRun(runtimeContext, runId),
    getRun: async (runId: string) => {
      await notifySetupPromise;
      return createRunHandle(runtimeContext, runId);
    },
    getRunStatus: async (runId: string) => getRunStatus(runtimeContext, runId),
    waitForRunResult: async <TReturn>(runId: string) =>
      waitForRunResult<TReturn>(runtimeContext, runId),
    queueWorkflow: async <TArgs extends unknown[], TReturn>(
      queue: QueueEntry | string,
      wf: WorkflowEntry<TArgs, TReturn> | string,
      args?: TArgs,
      options?: QueueWorkflowOptions,
    ) => {
      await notifySetupPromise;
      return queueWorkflow<TArgs, TReturn>(runtimeContext, queue, wf, args, options);
    },
    sendMessage: async <T>(target: Run | string, name: MessageDefinition<T>, data: T) => {
      await notifySetupPromise;
      return sendMessage(runtimeContext, target, name, data);
    },
    getState: async <T>(target: Run | string, key: StateDefinition<T> | string) => {
      await notifySetupPromise;
      return getState<T>(runtimeContext, target, key);
    },
  };
}

export type Instance = ReturnType<typeof createInstance>;
