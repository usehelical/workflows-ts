import { cancelRun as cancelRunCommand } from './db/commands/cancel-run';
import { RuntimeContext } from './context/runtime-context';

export async function cancelRun(
  ctx: RuntimeContext,
  runId: string,
  options: { cascade?: boolean } = {},
) {
  const { db, runRegistry } = ctx;
  const run = await cancelRunCommand(runId, db, options);
  if (!run) {
    return;
  }
  if (options.cascade) {
    for (const pathPart of run.path) {
      const run = runRegistry.getRun(pathPart);
      if (run) {
        run.abortController.abort();
      }
    }
    return;
  }
  runRegistry.getRun(runId)?.abortController.abort();
}
