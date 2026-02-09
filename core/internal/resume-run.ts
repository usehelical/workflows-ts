import { RuntimeContext } from './context/runtime-context';
import { resumeRun as resumeRunInDb } from './repository/resume-run';
import { createRunHandle } from '../../client/run';

export async function resumeRun(ctx: RuntimeContext, runId: string) {
  const { db } = ctx;
  await resumeRunInDb(db, runId);
  return createRunHandle<void>(ctx, runId);
}
