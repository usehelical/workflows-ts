import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { QueueEntry } from '../core/queue';
import { WorkflowEntry } from '../core/workflow';
import { ExecutionContext } from '../core/internal/execution-context';
import { StateEventBus } from '../core/internal/events/state-event-bus';
import { MessageEventBus } from '../core/internal/events/message-event-bus';
import { runWorkflow, RunWorkflowOptions } from './run-workflow';
import { RunRegistry } from '../core/internal/run-registry';
import { recoverPendingRuns } from '../core/internal/recover-pending-runs';
import { RuntimeContext } from '../core/internal/runtime-context';
import { WorkflowRegistry } from '../core/internal/workflow-registry';
import { RunEventBus } from '../core/internal/events/run-event-bus';
import { createRunHandle } from './run';
import { QueueRegistry } from '../core/internal/queue-registry';
import { cancelRun } from './cancel-run';
import { queueWorkflow, QueueWorkflowOptions } from './queue-workflow';
import { QueueManager } from '../core/internal/queue-manager';
import { setupPostgresNotify } from '../core/internal/events/setup-postgres-notify';
import { createPgDriver } from '../core/internal/db/driver';

type CreateInstanceOptions = {
  instanceId?: string;
  connectionString: string;
};

export const asyncLocalStorage = new AsyncLocalStorage<ExecutionContext>();

export type CreateInstanceParams = {
  workflows: Record<string, WorkflowEntry>;
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

  setupPostgresNotify(client, {
    runs: runEventBus.handleNotify.bind(runEventBus),
  });

  const queueManager = new QueueManager(runtimeContext);
  queueManager.start();

  recoverPendingRuns(runtimeContext);

  return {
    runWorkflow: async <TArgs extends unknown[], TReturn>(
      wf: WorkflowEntry<TArgs, TReturn> | string,
      args?: TArgs,
      options?: RunWorkflowOptions,
    ) => runWorkflow<TArgs, TReturn>(runtimeContext, wf, args, options),
    cancelRun: async (runId: string) => cancelRun(runtimeContext, runId),
    getRun: async (runId: string) => createRunHandle(runtimeContext, runId),
    queueWorkflow: async <TArgs extends unknown[], TReturn>(
      queue: QueueEntry | string,
      wf: WorkflowEntry<TArgs, TReturn> | string,
      args?: TArgs,
      options?: QueueWorkflowOptions,
    ) => queueWorkflow<TArgs, TReturn>(runtimeContext, queue, wf, args, options),
  };
}

export function runWithStore<TReturn>(store: ExecutionContext, callback: () => Promise<TReturn>) {
  return asyncLocalStorage.run(store, callback);
}
