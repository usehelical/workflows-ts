import { RunEventBus } from '../core/internal/events/run-event-bus';
import { RunNotFoundError, RunCancelledError } from '../core/internal/errors';
import { deserialize, deserializeError } from '../core/internal/serialization';
import { RunEntry } from '../core/internal/run-registry';
import { RuntimeContext } from '../core/internal/runtime-context';
import { getRunStatus } from '../core/internal/repository/get-run-status';
import { getRun } from '../core/internal/repository/get-run';
import { Database } from '../core/internal/db/db';
import { RunStatus } from '../core';

export interface Run<TReturn = unknown> {
  id: string;
  status: () => Promise<RunStatus>;
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

async function getRunStatusFromRegistry(runEntry: RunEntry): Promise<RunStatus> {
  if (runEntry.store.abortSignal.aborted) {
    return 'cancelled';
  }
  const promiseState = runEntry.getPromiseState();
  if (promiseState === 'pending') {
    return 'pending';
  }
  if (promiseState === 'fulfilled') {
    return 'success';
  }
  return 'error';
}

async function getRunResult<TReturn = unknown>(id: string, runEventBus: RunEventBus, db: Database) {
  const run = await getRun(db, id);
  if (!run) {
    throw new RunNotFoundError(id);
  }

  if (run.status === 'cancelled') {
    throw new RunCancelledError();
  }

  if (run.status === 'error') {
    throw run.error ? (deserializeError(run.error) as unknown as Error) : undefined;
  }

  return new Promise<TReturn>((resolve, reject) => {
    const unsubscribe = runEventBus.subscribe(id, '*', async (e) => {
      if (e.status === 'cancelled') {
        unsubscribe();
        reject(new RunCancelledError());
        return;
      }
      if (e.status === 'success' || e.status === 'error') {
        unsubscribe();
        try {
          const completedRun = await getRun(db, id);
          if (!completedRun) {
            reject(new RunNotFoundError(id));
            return;
          }
          if (completedRun.status === 'error') {
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
