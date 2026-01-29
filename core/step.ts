export type RetryConfig = {
  maxRetries?: number;
  retryDelay?: number;
  backOffRate?: number;
};

type StepOptions = RetryConfig & {
  name?: string;
};

export type StepFunction<Args extends unknown[], R> = (...args: Args) => Promise<R> | R;

export type StepDefinition<TArgs extends unknown[], TReturn> = {
  fn: StepFunction<TArgs, TReturn>;
  args: TArgs;
  options: StepOptions;
};

export function defineStep<TArgs extends unknown[], TReturn>(
  fn: StepFunction<TArgs, TReturn>,
  options: StepOptions = {},
): (...args: TArgs) => StepDefinition<TArgs, TReturn> {
  return (...args: TArgs) => {
    return {
      fn,
      args,
      options,
    };
  };
}
