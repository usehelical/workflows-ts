import { getWorkflowStore } from '../core/internal/store';
import { QueueDefinition } from '../core/queue';
import { createRunHandle } from '../core/run';
import { WorkflowDefinition, WorkflowStatus } from '../core/workflow';

const QUEUE_WORKFLOW_OPERATION_NAME = 'helical::workflow::queue';

export async function queueWorkflow<TArgs extends unknown[], TReturn>(
  wf: WorkflowDefinition<TArgs, TReturn>,
  queue: QueueDefinition,
) {
  const {
    operationManager,
    executorId,
    repository,
    runId: parentRunId,
    db,
    runEventBus,
  } = getWorkflowStore();

  let runId: string | undefined;

  const previousOperation = operationManager.getOperationResult();
  if (previousOperation) {
    runId = previousOperation.outputs as string;
  }

  runId = await operationManager.executeAtomicOperation(
    QUEUE_WORKFLOW_OPERATION_NAME,
    async (tx) => {
      const { id, changeId } = await repository.insertRun(tx, {
        inputs: wf.args,
        executorId: executorId,
        workflowName: wf.fn.name,
        parentRunId: parentRunId,
        status: WorkflowStatus.QUEUED,
      });
      runEventBus.emitEvent(
        id,
        WorkflowStatus.QUEUED,
        {
          status: WorkflowStatus.QUEUED,
          queueName: queue.name,
        },
        changeId,
      );
      return id;
    },
  );

  return createRunHandle<TReturn>(runId, {
    db,
    runEventBus,
    repository,
  });
}
