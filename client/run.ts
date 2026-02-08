import { RuntimeContext } from '../core/internal/runtime-context';
import { RunStatus } from '../core';
import { getRunStatus } from './get-run-status';
import { waitForRunResult } from './wait-for-run-result';

export type RunResult<TReturn> =
  | { error: Error; success: false }
  | { data: TReturn; success: true };

export interface Run<TReturn = unknown> {
  id: string;
  getStatus: () => Promise<RunStatus>;
  waitForResult: () => Promise<RunResult<TReturn>>;
}

export function createRunHandle<TReturn = unknown>(
  runtimeContext: RuntimeContext,
  id: string,
): Run<TReturn> {
  return {
    id,
    getStatus: () => getRunStatus(runtimeContext, id),
    waitForResult: () => waitForRunResult<TReturn>(runtimeContext, id),
  };
}
