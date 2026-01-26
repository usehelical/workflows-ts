import { QueueDefinition } from '../core/queue';
import { createDbClient } from '../core/internal/db/client';
import { WorkflowDefinition, WorkflowEntry } from '../core/workflow';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RepositoryImpl } from '../core/internal/repository/repository';
import { WorkflowStore } from '../core/internal/store';
import { RunEventBus } from '../core/internal/events/run-event-bus';
import { StateEventBus } from '../core/internal/events/state-event-bus';
import { MessageEventBus } from '../core/internal/events/message-event-bus';
import crypto from 'node:crypto';
import { createRunHandle } from './run';
import { WorkflowStoreDependencies } from './utils';
import { startWorkflowInternal, StartWorkflowOptions } from './start-workflow';
import { RunNotFoundError, WorkflowNotFoundError } from '../core/internal/errors';
import { RunRegistry } from '../core/internal/run-registry';
import { cancelRun } from '../core/internal/repository/cancel-run';
import { recoverPendingRuns } from '../core/internal/recover-pending-runs';

type CreateInstanceOptions = {
  instanceId?: string;
  connectionString: string;
};

export const asyncLocalStorage = new AsyncLocalStorage<WorkflowStore>();

type CreateInstanceProps = {
  workflows: Record<string, WorkflowEntry>;
  queues?: QueueDefinition[];
  options: CreateInstanceOptions;
};

export function createInstance(props: CreateInstanceProps) {
  const db = createDbClient({ connectionString: props.options.connectionString });
  const messageEventBus = new MessageEventBus(db);
  const stateEventBus = new StateEventBus(db);
  const executorId = props.options.instanceId || crypto.randomUUID();
  const runRegistry = new RunRegistry();

  const fnToName = new Map<Function, string>();
  for (const [name, entry] of Object.entries(props.workflows)) {
    fnToName.set(entry, name);
  }

  const workflowStoreDependencies: Omit<WorkflowStoreDependencies, 'abortSignal'> = {
    db,
    executorId,
    messageEventBus,
    stateEventBus,
  };

  recoverPendingRuns(db)

  return {
    startWorkflow: async <TArgs extends unknown[], TReturn>(
      wf: () => WorkflowDefinition<TArgs, TReturn>,
      args?: TArgs,
      options?: StartWorkflowOptions,
    ) => {
      const workflowName = fnToName.get(wf);
      if (!workflowName) {
        console.error(`Workflow not found`);
        throw new WorkflowNotFoundError('unknown');
      }
      const workflow = props.workflows[workflowName];
      const workflowDef = workflow();
      const runId = await startWorkflowInternal(
        workflowName,
        workflowDef.fn,
        args ?? [],
        runRegistry,
        workflowStoreDependencies,
        options,
      );
      return createRunHandle<TReturn>(runId, {
        db,
        runRegistry,
      });
    },
    cancelWorkflow: async (runId: string) => {
      const run = await cancelRun(runId, db);
      if (!run) {
        throw new RunNotFoundError(runId);
      }
      for (const pathPart of run.path) {
        const run = runRegistry.getRun(pathPart);
        if (run) {
          run.abortController.abort();
        }
      }
    },
  };
}

export function runWithStore<TReturn>(store: WorkflowStore, callback: () => Promise<TReturn>) {
  return asyncLocalStorage.run(store, callback);
}
