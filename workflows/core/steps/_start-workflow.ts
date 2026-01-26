import { Operation, OperationManager } from '../core/internal/operation-manager';
import { getWorkflowStore, WorkflowStore } from '../core/internal/store';
import { createRunHandle, Run } from '../core/run';
import { runWithStore } from '../core/runtime';
import { WorkflowDefinition, WorkflowStatus } from '../core/workflow';

const START_WORKFLOW_OPERATION_NAME = 'helical::workflow::start';

export async function startWorkflow<TArgs extends unknown[], TReturn>(
  wf: WorkflowDefinition<TArgs, TReturn>,
): Promise<Run<TReturn>> {
  const {
    operationManager,
    executorId,
    runId: parentRunId,
    db,
    repository,
    runEventBus,
  } = getWorkflowStore();

  const args: TArgs = wf.args;
  const workflowName = wf.fn.name;

  let runId: string | undefined;

  const previousOperation = operationManager.getOperationResult();
  if (previousOperation) {
    runId = previousOperation.outputs as string;
    const store = createWorkflowStore(runId, await repository.getWorkflowOperations(db, runId));
    runWithStore(store, async () => {
      return await wf.fn(...wf.args);
    });
  } else {
    runId = await operationManager.runOperationAndRecordResult(
      START_WORKFLOW_OPERATION_NAME,
      async (tx) => {
        const { id, changeId } = await repository.insertRun(tx, {
          inputs: args,
          executorId: executorId,
          workflowName: workflowName,
          parentWorkflowId: parentRunId,
          status: WorkflowStatus.PENDING,
        });
        runEventBus.emitEvent(
          id,
          WorkflowStatus.PENDING,
          { status: WorkflowStatus.PENDING },
          changeId,
        );
        return id;
      },
    );
    runWithStore(createWorkflowStore(runId), async () => {
      return await wf.fn(...wf.args);
    });
  }

  return createRunHandle<TReturn>(runId, {
    db,
    runEventBus,
    repository,
  });
}

function createWorkflowStore(runId: string, operations?: Operation[]): WorkflowStore {
  const { db, executorId, messageEventBus, stateEventBus, runEventBus, repository } =
    getWorkflowStore();
  return {
    db,
    runId: runId,
    executorId: executorId,
    parentWorkflow: getWorkflowStore(),
    operationManager: new OperationManager(db, runId, operations),
    messageEventBus: messageEventBus,
    stateEventBus: stateEventBus,
    runEventBus: runEventBus,
    repository: repository,
  };
}
