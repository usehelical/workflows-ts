import {
  ErrorThatShouldNeverHappen,
  FatalError,
  MaxRetriesExceededError,
} from '../internal/errors';
import { getExecutionContext } from '../internal/execution-context';
import { sleep } from '../internal/utils/sleep';
import {
  executeAndRecordOperation,
  returnOrThrowOperationResult,
} from '../internal/operation-manager';

export type RetryConfig = {
  maxRetries?: number;
  retryDelay?: number;
  backOffRate?: number;
};

type RunStepOptions = RetryConfig & {
  name?: string;
};

export async function runStep<TReturn>(
  stepFn: () => Promise<TReturn>,
  options: RunStepOptions = {},
) {
  const { maxRetries, retryDelay, backOffRate } = options;
  const { operationManager } = getExecutionContext();
  const stepName = options.name || stepFn.name || '<unknown>';

  const op = operationManager.getOperationResult();
  if (op) {
    return returnOrThrowOperationResult<TReturn>(op);
  }
  return await executeAndRecordOperation(operationManager, stepName, async () => {
    return await executeStepWithRetries(stepName, stepFn, { maxRetries, retryDelay, backOffRate });
  });
}

export async function executeStepWithRetries<TReturn>(
  stepName: string,
  fn: () => Promise<TReturn>,
  retryConfig: RetryConfig,
): Promise<TReturn> {
  const maxRetries = retryConfig.maxRetries ?? 0;
  const retryDelay = retryConfig.retryDelay ?? 0;
  const backOffRate = retryConfig.backOffRate ?? 1;

  const attemptErrors: Error[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
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
