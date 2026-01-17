// should handle
// starting workflows
// cancelling workflows
// replaying workflows

import { Kysely } from 'kysely';
import { WorkflowFunction } from '../workflow';

export class Executor {
  constructor(private readonly db: Kysely<any>) {}

  async startWorkflow(id: string, args: unknown[], fn: WorkflowFunction<unknown[], unknown>) {
    // create a new workflow context here
    // run the workflow function
    this.db
      .insertInto('workflow_contexts')
      .values({
        workflow_id: id,
        key: 'workflow_args',
        value: JSON.stringify(args),
      })
      .execute();
  }
}

function createWorkflowContext() {
  // do we have an existing context for this workflow?
}
