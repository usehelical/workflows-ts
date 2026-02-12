export enum ErrorType {
  INVALID_WORKFLOW_TRANSITION = 'INVALID_WORKFLOW_TRANSITION',
  RUN_CANCELLED = 'RUN_CANCELLED',
  RUN_NOT_FOUND = 'RUN_NOT_FOUND',
  RUN_OUTSIDE_OF_WORKFLOW = 'RUN_OUTSIDE_OF_WORKFLOW',
  FATAL_ERROR = 'FATAL_ERROR',
  NO_MESSAGE_AVAILABLE = 'NO_MESSAGE_AVAILABLE',
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
  ERROR_THAT_SHOULD_NEVER_HAPPEN = 'ERROR_THAT_SHOULD_NEVER_HAPPEN',
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',
  MAX_RECOVERY_ATTEMPTS_EXCEEDED = 'MAX_RECOVERY_ATTEMPTS_EXCEEDED',
  WORKFLOW_NOT_FOUND = 'WORKFLOW_NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  CANCEL = 'CANCEL',
  DEADLINE = 'DEADLINE',
  RUN_NOT_CANCELLABLE = 'RUN_NOT_CANCELLABLE',
  QUEUE_NOT_FOUND = 'QUEUE_NOT_FOUND',
}

export type ErrorReason =
  | 'timeout'
  | 'deadline'
  | 'cancel'
  | 'unhandled'
  | 'max_recovery_attempts_exceeded'
  | 'workflow_not_found'
  | 'unknown'
  | 'run_not_found'
  | 'outside_workflow_context'
  | 'fatal_error'
  | 'max_retries_exceeded'
  | 'serialization_error';

export class BaseError extends Error {
  readonly reason: ErrorReason;

  constructor(message: string, reason: ErrorReason) {
    super(message);
    this.reason = reason;
  }
}

export class RunTimedOutError extends BaseError {
  constructor() {
    super('This workflow run has timed out', 'timeout');
  }
}

export class UnknownError extends BaseError {
  constructor(message?: string) {
    super(message || 'An unknown error occurred', 'unknown');
  }
}

export class RunDeadlineExceededError extends BaseError {
  constructor() {
    super('This workflow run has exceeded its deadline', 'deadline');
  }
}

export class RunCancelledError extends BaseError {
  constructor() {
    super('This workflow run has been cancelled', 'cancel');
  }
}

export class MaxRecoveryAttemptsExceededError extends BaseError {
  constructor(runId: string, attempts: number) {
    super(
      `Max recovery attempts exceeded for run "${runId}" after ${attempts + 1} attempts`,
      'max_recovery_attempts_exceeded',
    );
  }
}

export class OperationTimedOutError extends BaseError {
  constructor(operationName: string) {
    super(`This operation "${operationName}" has timed out`, 'timeout');
  }
}

export class RunNotFoundError extends BaseError {
  constructor(runId: string) {
    super(`Workflow run "${runId}" not found`, 'run_not_found');
  }
}

export class RunOutsideOfWorkflowError extends BaseError {
  constructor() {
    super('This function must be called within a workflow', 'outside_workflow_context');
  }
}

export class FatalError extends BaseError {
  constructor(message: string) {
    super(message, 'fatal_error');
  }
}

export class MaxRetriesExceededError extends BaseError {
  readonly attemptErrors: Error[];
  readonly stepName: string;
  readonly maxAttempts: number;

  constructor(stepName: string, maxAttempts: number, errors: Error[]) {
    const formattedErrors = errors
      .map((error, index) => `Attempt ${index + 1}: ${error.message}`)
      .join('. ');

    super(
      `Step "${stepName}" failed after ${maxAttempts + 1} attempts. ${formattedErrors}`,
      'max_retries_exceeded',
    );

    this.attemptErrors = errors;
    this.stepName = stepName;
    this.maxAttempts = maxAttempts;
  }
}

export class SerializationError extends BaseError {
  constructor(message: string) {
    super(message, 'serialization_error');
  }
}

export class WorkflowNotFoundError extends BaseError {
  constructor(workflowName: string) {
    super(`Workflow "${workflowName}" not found`, 'workflow_not_found');
  }
}
