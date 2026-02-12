import { cancelRun as cancelRunCommand } from './db/commands/cancel-run';
import { RuntimeContext } from './context/runtime-context';
import { ClientContext } from './context/client-context';
import { ExecutionContext } from './context/execution-context';

export async function cancelRun(
  ctx: RuntimeContext | ClientContext | ExecutionContext,
  runId: string,
  options: { cascade?: boolean } = {},
) {
  if (ctx.type === 'execution' || ctx.type === 'runtime') {
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
  } else {
    const { db } = ctx;
    const run = await cancelRunCommand(runId, db, options);
    if (!run) {
      return;
    }
  }
}
