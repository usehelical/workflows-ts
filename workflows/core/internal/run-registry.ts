import { WorkflowStore } from './store';

export interface RunEntry<TReturn = unknown> {
  store: WorkflowStore;
  promise: Promise<TReturn>;
  abortController: AbortController;
  getPromiseState(): 'pending' | 'fulfilled' | 'rejected';
}

export class RunRegistry {
  private readonly runs: Map<string, RunEntry> = new Map();

  registerRun(runId: string, entry: Omit<RunEntry, 'getPromiseState'>) {
    let state: 'pending' | 'fulfilled' | 'rejected' = 'pending';

    entry.promise.then(
      () => {
        state = 'fulfilled';
      },
      () => {
        state = 'rejected';
      },
    );

    this.runs.set(runId, {
      ...entry,
      getPromiseState: () => state,
    });
  }

  unregisterRun(runId: string) {
    this.runs.delete(runId);
  }

  getRun(runId: string) {
    return this.runs.get(runId);
  }
}
