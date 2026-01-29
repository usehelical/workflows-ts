import { Kysely } from 'kysely';
import { WorkflowStatus } from '../core/workflow';
import { RunEventBus } from '../core/internal/events/run-event-bus';
import { RunNotFoundError, RunCancelledError } from '../core/internal/errors';
import { deserialize, deserializeError } from '../core/internal/serialization';
import { RunEntry } from '../core/internal/run-registry';
import { RuntimeContext } from '../core/internal/runtime-context';
import { getRunStatus } from '../core/internal/repository/get-run-status';
import { getRun } from '../core/internal/repository/get-run';

export interface Run<TReturn = unknown> {
  id: string;
  status: () => Promise<WorkflowStatus>;
  result: () => Promise<TReturn>;
}

export function createRunHandle<TReturn = unknown>(
  runtimeContext: RuntimeContext,
  id: string,
): Run<TReturn> {
  const { runRegistry, db, runEventBus } = runtimeContext;
  const run = runRegistry.getRun(id);

  if (run) {
    return {
      id,
      status: () => getRunStatusFromRegistry(run),
      result: () => run.promise as Promise<TReturn>,
    };
  }

  return {
    id,
    status: () => getRunStatus(db, id),
    result: () => getRunResult<TReturn>(id, runEventBus, db),
  };
}

async function getRunStatusFromRegistry(runEntry: RunEntry): Promise<WorkflowStatus> {
  if (runEntry.store.abortSignal.aborted) {
    return WorkflowStatus.CANCELLED;
  }
  const promiseState = runEntry.getPromiseState();
  if (promiseState === 'pending') {
    return WorkflowStatus.PENDING;
  }
  if (promiseState === 'fulfilled') {
    return WorkflowStatus.SUCCESS;
  }
  return WorkflowStatus.ERROR;
}

async function getRunResult<TReturn = unknown>(
  id: string,
  runEventBus: RunEventBus,
  db: Kysely<any>,
) {
  const run = await getRun(db, id);
  if (!run) {
    throw new RunNotFoundError(id);
  }

  if (run.status === WorkflowStatus.CANCELLED) {
    throw new RunCancelledError();
  }

  if (run.status === WorkflowStatus.ERROR) {
    throw run.error ? (deserializeError(run.error) as unknown as Error) : undefined;
  }

  return new Promise<TReturn>((resolve, reject) => {
    const unsubscribe = runEventBus.subscribe(id, '*', async (e) => {
      if (e.status === WorkflowStatus.CANCELLED) {
        unsubscribe();
        reject(new RunCancelledError());
        return;
      }
      if (e.status === WorkflowStatus.SUCCESS || e.status === WorkflowStatus.ERROR) {
        unsubscribe();
        try {
          const completedRun = await getRun(db, id);
          if (!completedRun) {
            reject(new RunNotFoundError(id));
            return;
          }
          if (completedRun.status === WorkflowStatus.ERROR) {
            reject(
              completedRun.error
                ? (deserializeError(completedRun.error) as unknown as Error)
                : new Error('error'),
            );
            return;
          }
          resolve(
            completedRun.output
              ? (deserialize(completedRun.output) as TReturn)
              : (undefined as TReturn),
          );
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}
