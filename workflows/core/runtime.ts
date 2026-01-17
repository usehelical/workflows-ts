import { QueueDefinition } from './queue';
import { createDbClient } from './internal/db/client';
import { Workflow, WorkflowDefinition } from './workflow';

interface InstanceClientHandle {
  getWorkflow: (id: string) => Promise<any | null>;
  getState: <T>(workflowId: string) => Promise<T | null>;
  sendMessage: <T>(workflowId: string, message: T) => Promise<void>;
  startWorkflow: <TInput extends unknown[], TReturn>(workflow: WorkflowDefinition<TInput, TReturn>, input: TInput) => Promise<any>;
  enqueueWorkflow: <TInput, TReturn>(
    workflow: WorkflowDefinition<TInput extends unknown[], TReturn extends unknown> | string,
    input: TInput,
  ) => Promise<any>;
  listWorkflows: () => Promise<Workflow[]>;
  listWorkflowSteps: (workflowId: string) => Promise<any[]>;
  cancelWorkflow: (workflowId: string) => Promise<void>;
  resumeWorkflow: (workflowId: string) => Promise<void>;
  forkWorkflow: (workflowId: string) => Promise<void>;
}

export function createFidaInstance<W extends Record<string, WorkflowDefinition>>(
  workflows: W,
  queues: QueueDefinition[],
) {
  const db = createDbClient();
  // create pg connection

  return {};
}
