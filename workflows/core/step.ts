import { getWorkflowStore } from './internal/store';

type StepOptions = {
  maxRetries?: number;
  retryDelay?: number;
  backOffRate?: number;
};

export async function runStep<TReturn>(
  fn: () => Promise<TReturn> | TReturn,
  options?: StepOptions,
) {
  const { operationManager } = getWorkflowStore();
  const stepName = fn.name || '<unknown>';

  const result = operationManager.getOperationResult();
  if (result) {
    return result;
  }

  // need to handle retries etc. here
  return await operationManager.runOperationAndRecordResult(stepName, async () => {
    return await fn();
  });
}
