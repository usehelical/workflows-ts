import {
  ErrorThatShouldNeverHappen,
  FatalError,
  MaxRetriesExceededError,
} from '../internal/errors';
import { getExecutionContext } from '../internal/execution-context';
import { sleep } from '../internal/utils/sleep';
import { RetryConfig, StepDefinition, StepFunction } from '../step';
import {
  executeAndRecordOperation,
  returnOrThrowOperationResult,
} from '../internal/operation-manager';

export async function runStep<TArgs extends unknown[], TReturn>(
  step: StepDefinition<TArgs, TReturn>,
) {
  const { operationManager } = getExecutionContext();
  const stepName = step.options.name || step.fn.name || '<unknown>';

  const op = operationManager.getOperationResult();
  if (op) {
    return returnOrThrowOperationResult<TReturn>(op);
  }
  return await executeAndRecordOperation(operationManager, stepName, async () => {
    return await executeStepWithRetries(stepName, step.fn, step.args, step.options);
  });
}

export async function executeStepWithRetries<TArgs extends unknown[], TReturn>(
  stepName: string,
  fn: StepFunction<TArgs, TReturn>,
  args: TArgs,
  retryConfig: RetryConfig,
): Promise<TReturn> {
  const maxRetries = retryConfig.maxRetries ?? 0;
  const retryDelay = retryConfig.retryDelay ?? 0;
  const backOffRate = retryConfig.backOffRate ?? 1;

  const attemptErrors: Error[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(...args);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      attemptErrors.push(err);
      if (err instanceof FatalError) {
        throw err;
      }
      if (maxRetries === 0) {
        throw err;
      }
      if (attempt >= maxRetries) {
        throw new MaxRetriesExceededError(stepName, maxRetries, attemptErrors);
      }
      const delay = retryDelay * Math.pow(backOffRate, attempt);
      await sleep(delay);
    }
  }
  throw new ErrorThatShouldNeverHappen(`Step "${stepName}" should never be reached`);
}
