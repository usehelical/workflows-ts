export type RunStatus =
  | 'pending'
  | 'queued'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'max_recovery_attempts_exceeded';

export const TERMINAL_STATES: RunStatus[] = [
  'success',
  'error',
  'cancelled',
  'max_recovery_attempts_exceeded',
];

export type WorkflowFunction<Args extends unknown[], R> = (...args: Args) => Promise<R> | R;

export type WorkflowDefinition<TArgs extends unknown[] = unknown[], TReturn = unknown> = {
  fn: WorkflowFunction<TArgs, TReturn>;
  maxRecoveryAttempts?: number;
};

export function defineWorkflow<TArgs extends unknown[], TReturn>(
  fn: WorkflowFunction<TArgs, TReturn>,
  options: {
    maxRecoveryAttempts?: number;
  } = {},
): () => WorkflowDefinition<TArgs, TReturn> {
  return () => {
    return {
      fn,
      maxRecoveryAttempts: options.maxRecoveryAttempts,
    };
  };
}

export type WorkflowEntry<
  TArgs extends unknown[] = unknown[],
  TReturn = unknown,
> = () => WorkflowDefinition<TArgs, TReturn>;
