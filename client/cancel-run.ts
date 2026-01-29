import { RunNotFoundError } from '../core/internal/errors';
import { cancelRun as cancelRunInDb } from '../core/internal/repository/cancel-run';
import { RuntimeContext } from '../core/internal/runtime-context';

export async function cancelRun(ctx: RuntimeContext, runId: string) {
  const { db, runRegistry } = ctx;
  const run = await cancelRunInDb(runId, db);
  if (!run) {
    throw new RunNotFoundError(runId);
  }
  for (const pathPart of run.path) {
    const run = runRegistry.getRun(pathPart);
    if (run) {
      run.abortController.abort();
    }
  }
}
