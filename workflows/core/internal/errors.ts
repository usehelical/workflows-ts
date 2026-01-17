export enum ErrorType {
  INVALID_WORKFLOW_TRANSITION = 'INVALID_WORKFLOW_TRANSITION',
  WORKFLOW_CANCELLED = 'WORKFLOW_CANCELLED',
  WORKFLOW_NOT_FOUND = 'WORKFLOW_NOT_FOUND',
}

export class InvalidWorkflowTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorType.INVALID_WORKFLOW_TRANSITION;
  }
}

export class WorkflowCancelledError extends Error {
  constructor() {
    super('This workflow has been cancelled');
    this.name = ErrorType.WORKFLOW_CANCELLED;
  }
}

export class WorkflowNotFoundError extends Error {
  constructor(workflowId: string) {
    super(`Workflow ${workflowId} not found`);
    this.name = ErrorType.WORKFLOW_NOT_FOUND;
  }
}
