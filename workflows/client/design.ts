import { QueueDefinition } from '../core/queue';
import { WorkflowDefinition } from '../core/workflow';

interface InstanceClientHandle {
  startWorkflow: <TInput extends unknown[], TReturn>(
    workflow: WorkflowDefinition<TInput, TReturn>,
  ) => Promise<any>;
  queueWorkflow: (workflow: WorkflowDefinition, queue: QueueDefinition) => Promise<any>;
  getWorkflow: (id: string) => Promise<any | null>;
  getState: <T>(workflowId: string) => Promise<T | null>;
  sendMessage: <T>(workflowId: string, message: T) => Promise<void>;
  // enqueueWorkflow: <TInput, TReturn>(
  //   workflow: WorkflowDefinition<TInput extends unknown[], TReturn extends unknown> | string,
  //   input: TInput,
  // ) => Promise<any>;
  // listWorkflows: () => Promise<Workflow[]>;
  listWorkflowSteps: (workflowId: string) => Promise<any[]>;
  cancelWorkflow: (workflowId: string) => Promise<void>;
  resumeWorkflow: (workflowId: string) => Promise<void>;
  forkWorkflow: (workflowId: string) => Promise<void>;
}
