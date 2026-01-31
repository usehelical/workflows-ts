import { getExecutionContext } from '../../internal/execution-context';
import { createHash } from 'node:crypto';

/**
 * Generates a stable, unique step ID based on the current run ID and sequence ID.
 * This ID is deterministic and will remain the same across retries, making it
 * suitable for use as an idempotency key with third-party systems.
 *
 * The step ID is a SHA-256 hash of the run ID and sequence ID, formatted as a
 * hex string for easy use with external APIs.
 *
 * @returns A unique, stable identifier for the current step execution
 */
export function getStepId(): string {
  const ctx = getExecutionContext();
  const sequenceId = ctx.operationManager.getActiveSequenceId();

  if (sequenceId === null) {
    throw new Error('getStepId() can only be called from within a step function');
  }

  const hash = createHash('sha256');
  hash.update(`${ctx.runId}:${sequenceId}`);
  return hash.digest('hex');
}
