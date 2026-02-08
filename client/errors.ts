export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'timeout';
  }
}

export class MaxRecoveryAttemptsExceededError extends Error {
  constructor(runId: string, maxAttempts: number) {
    super(`Max recovery attempts exceeded for run "${runId}" after ${maxAttempts + 1} attempts`);
    this.name = 'max_recovery_attempts_exceeded';
  }
}

export class WorkflowNotFoundError extends Error {
  constructor(workflowName: string) {
    super(`Workflow "${workflowName}" not found`);
    this.name = 'workflow_not_found';
  }
}

export class QueueNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'queue_not_found';
  }
}
