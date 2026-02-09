import { RuntimeContext } from '../core/internal/context/runtime-context';
import { RunStatus } from '../core';
import { getRunStatus } from '../core/internal/get-run-status';
import { waitForRunResult } from '../core/internal/wait-for-run-result';
import { BaseError } from '../core/internal/errors';

export type RunResult<TReturn> =
  | { error: BaseError | Error; success: false }
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
