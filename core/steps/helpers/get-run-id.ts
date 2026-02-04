import { getExecutionContext } from '../../internal/execution-context';

export function getRunId() {
  const { runId } = getExecutionContext();
  return runId;
}
