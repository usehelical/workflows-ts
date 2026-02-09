import { executeWorkflow } from './execute-workflow';
import { getOperations } from './repository/get-operations';
import { getPendingRuns } from './repository/get-pending-runs';
import { upsertRun } from './repository/upsert-run';
import { RuntimeContext } from './context/runtime-context';
import { deserialize } from './utils/serialization';

export async function recoverPendingRuns(ctx: RuntimeContext) {
  const { db, executorId, workflowRegistry } = ctx;
  const pendingRuns = await getPendingRuns(db, executorId);
  for (const run of pendingRuns) {
    try {
      const operations = await getOperations(db, run.id);
      const workflow = workflowRegistry.getByName(run.workflowName);
      if (!workflow) {
        console.error(`Workflow ${run.workflowName} not found for recovery`);
        continue;
      }
      const args = run.inputs ? deserialize<unknown[]>(run.inputs) : [];
      const upsertResult = await upsertRun(db, {
        runId: run.id,
        path: run.path,
        inputs: run.inputs ?? '',
        executorId: executorId,
        workflowName: run.workflowName,
        status: 'pending',
        isRecovery: true,
      });
      if (!upsertResult.shouldExecute) {
        console.log(`Run ${run.id} already executed, skipping recovery`);
        continue;
      }
      await executeWorkflow(ctx, {
        runId: upsertResult.runId,
        runPath: upsertResult.path,
        workflowName: run.workflowName,
        fn: workflow.fn,
        args: args,
        operations,
      });
    } catch (error) {
      console.error(`Error recovering run ${run.id}:`, error);
    }
  }
}
