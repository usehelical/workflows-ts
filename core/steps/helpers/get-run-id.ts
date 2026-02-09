import { getExecutionContext } from '../../internal/context/execution-context';

export function getRunId() {
  const { runId } = getExecutionContext();
  return runId;
}
