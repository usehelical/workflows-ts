import { WorkflowDefinition, WorkflowEntry } from '../workflow';

export class WorkflowRegistry {
  private readonly workflows: Record<string, WorkflowEntry> = {};
  private readonly fnToName: Map<Function, string> = new Map();

  constructor(workflows: Record<string, WorkflowEntry>) {
    this.workflows = workflows;
    for (const [name, entry] of Object.entries(workflows)) {
      this.fnToName.set(entry, name);
    }
  }

  getByName(name: string): (WorkflowDefinition & { name: string }) | undefined {
    const entry = this.workflows[name];
    if (!entry) {
      return undefined;
    }
    return {
      ...entry(),
      name,
    };
  }

  getByWorkflowDefinition<TArgs extends unknown[], TReturn>(
    definition: WorkflowEntry<TArgs, TReturn>,
  ): (WorkflowDefinition<TArgs, TReturn> & { name: string }) | undefined {
    const name = this.fnToName.get(definition);
    if (!name) {
      return undefined;
    }
    return {
      ...definition(),
      name,
    };
  }
}
