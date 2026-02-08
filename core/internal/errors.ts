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

export class InvalidWorkflowTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorType.INVALID_WORKFLOW_TRANSITION;
  }
}

export class RunCancelledError extends Error {
  constructor() {
    super('This workflow run has been cancelled');
    this.name = ErrorType.RUN_CANCELLED;
  }
}

export class RunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Workflow run "${runId}" not found`);
    this.name = ErrorType.RUN_NOT_FOUND;
  }
}

export class RunOutsideOfWorkflowError extends Error {
  constructor() {
    super('This function must be called within a workflow');
    this.name = ErrorType.RUN_OUTSIDE_OF_WORKFLOW;
  }
}

export class FatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorType.FATAL_ERROR;
  }
}

export class MaxRetriesExceededError extends Error {
  readonly attemptErrors: Error[];
  readonly stepName: string;
  readonly maxAttempts: number;

  constructor(stepName: string, maxAttempts: number, errors: Error[]) {
    const formattedErrors = errors
      .map((error, index) => `Attempt ${index + 1}: ${error.message}`)
      .join('. ');

    super(`Step "${stepName}" failed after ${maxAttempts + 1} attempts. ${formattedErrors}`);

    this.name = ErrorType.MAX_RETRIES_EXCEEDED;
    this.attemptErrors = errors;
    this.stepName = stepName;
    this.maxAttempts = maxAttempts;
  }
}

export class ErrorThatShouldNeverHappen extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorType.ERROR_THAT_SHOULD_NEVER_HAPPEN;
  }
}

export class MessageNotAvailableError extends Error {
  constructor() {
    super('Message not available');
    this.name = ErrorType.NO_MESSAGE_AVAILABLE;
  }
}

export class SerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorType.SERIALIZATION_ERROR;
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorType.TIMEOUT;
  }
}

export class DeadlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorType.DEADLINE;
  }
}

export class CancelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorType.CANCEL;
  }
}

export class RunNotCancellableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorType.RUN_NOT_CANCELLABLE;
    this.message = message;
  }
}
