import { WorkflowDefinition } from './workflow';
import { QueueDefinition } from './queue';
import { MessageDefinition } from './message';
import { StateDefinition } from './state';
import {
  queueWorkflow as queueWorkflowInternal,
  type QueueWorkflowOptions,
} from '@internal/queue-workflow';
import {
  runWorkflow as runWorkflowInternal,
  type RunWorkflowOptions,
} from '@internal/run-workflow';
import { cancelRun as cancelRunInternal } from '@internal/cancel-run';
import { resumeRun as resumeRunInternal } from '@internal/resume-run';
import { sendMessage as sendMessageInternal } from '@internal/send-message';
import { getState as getStateInternal } from '@internal/get-state';
import { createRunHandle, type Run } from '@internal/run';
import { getExecutionContext } from '@internal/context/execution-context';

export interface RunWorkflowFunction {
  <TArgs extends unknown[], TReturn>(
    workflow: WorkflowDefinition<TArgs, TReturn>,
    options: RunWorkflowOptions,
  ): Promise<Run<TReturn>>;

  <TArgs extends unknown[], TReturn>(
    workflow: WorkflowDefinition<TArgs, TReturn>,
    args?: TArgs,
    options?: RunWorkflowOptions,
  ): Promise<Run<TReturn>>;
}

export interface QueueWorkflowFunction {
  <TArgs extends unknown[], TReturn = unknown>(
    queue: QueueDefinition,
    workflow: WorkflowDefinition<TArgs, TReturn>,
    args: TArgs,
    options?: QueueWorkflowOptions,
  ): Promise<Run<TReturn>>;

  <TArgs extends unknown[], TReturn = unknown>(
    queue: QueueDefinition,
    workflow: WorkflowDefinition<TArgs, TReturn>,
    options: QueueWorkflowOptions,
  ): Promise<Run<TReturn>>;

  <TArgs extends unknown[], TReturn = unknown>(
    queue: QueueDefinition,
    workflow: WorkflowDefinition<TArgs, TReturn>,
  ): Promise<Run<TReturn>>;
}

export type CancelRunFunction = (runId: string) => Promise<void>;
export type ResumeRunFunction = (runId: string) => Promise<void>;
export type GetRunFunction = <TReturn = unknown>(runId: string) => Promise<Run<TReturn>>;
export type SendMessageFunction = <TData = unknown>(
  runId: string,
  name: MessageDefinition<TData>,
  data: TData,
) => Promise<void>;
export type GetStateFunction = <TData = unknown>(
  runId: string,
  key: StateDefinition<TData>,
) => Promise<TData | undefined>;

export const runWorkflow: RunWorkflowFunction = async <TArgs extends unknown[], TReturn = unknown>(
  workflow: WorkflowDefinition<TArgs, TReturn>,
  argsOrOptions?: TArgs | RunWorkflowOptions,
  options?: RunWorkflowOptions,
) => {
  let args, opts;
  if (argsOrOptions !== undefined) {
    if (Array.isArray(argsOrOptions)) {
      args = argsOrOptions;
      opts = options;
    } else {
      opts = argsOrOptions;
    }
  }
  return runWorkflowInternal<TArgs, TReturn>(getExecutionContext(), workflow.name, args, opts);
};

export const queueWorkflow: QueueWorkflowFunction = async <
  TArgs extends unknown[],
  TReturn = unknown,
>(
  queue: QueueDefinition,
  workflow: WorkflowDefinition<TArgs, TReturn>,
  argsOrOptions?: TArgs | QueueWorkflowOptions,
  options?: QueueWorkflowOptions,
) => {
  let args, opts;
  if (argsOrOptions !== undefined) {
    if (Array.isArray(argsOrOptions)) {
      args = argsOrOptions;
      opts = options;
    } else {
      opts = argsOrOptions;
    }
  }
  return queueWorkflowInternal(getExecutionContext(), queue.name, workflow.name, args, opts);
};

export const getRun: GetRunFunction = async <TReturn = unknown>(runId: string) => {
  return createRunHandle<TReturn>(getExecutionContext(), runId);
};

export const cancelRun: CancelRunFunction = async (runId: string) => {
  return cancelRunInternal(getExecutionContext(), runId);
};

export const resumeRun: ResumeRunFunction = async (runId: string) => {
  return resumeRunInternal(getExecutionContext(), runId);
};

export const sendMessage: SendMessageFunction = async <TData = unknown>(
  runId: string,
  name: MessageDefinition<TData>,
  data: TData,
) => {
  return sendMessageInternal(getExecutionContext(), runId, name, data);
};

export const getState: GetStateFunction = async <TData = unknown>(
  runId: string,
  key: StateDefinition<TData>,
) => {
  return getStateInternal(getExecutionContext(), runId, key);
};
