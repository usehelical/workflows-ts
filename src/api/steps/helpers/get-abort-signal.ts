import { getExecutionContext } from '@internal/context/execution-context';

export function getAbortSignal() {
  return getExecutionContext().abortSignal;
}
