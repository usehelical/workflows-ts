// all operations scoped to a specific workflow
type WorkflowHandle<W> = {
  result: () => Promise<any>;
  status: () => Promise<WorkflowStatus>;
  getContext: <C>(context: C) => Promise<any>;
  sendMessage: <M>(message: M) => Promise<void>;
};

type StartWorkflowFn<W> = (workflow: W, params?: any, options?: {}) => Promise<WorkflowHandle<W>>;

type Client = {
  getWorkflow: <W>(workflow: W, id: string) => WorkflowHandle<W>;
  startWorkflow: <W>(
    workflow: W,
    input: any,
    { queue }: { queue: any },
  ) => Promise<WorkflowHandle<W>>;
};

export function createClient() {}
