import { RuntimeContext } from '../core/internal/runtime-context';
import { resumeRun as resumeRunInDb } from '../core/internal/repository/resume-run';
import { createRunHandle } from './run';

export async function resumeRun(ctx: RuntimeContext, runId: string) {
  const { db } = ctx;
  await resumeRunInDb(db, runId);
  return createRunHandle<void>(ctx, runId);
}
