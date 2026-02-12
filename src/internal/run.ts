import { RuntimeContext } from '@internal/context/runtime-context';
import { RunStatus } from '../api';
import { getRunStatus } from '@internal/get-run-status';
import { waitForRunResult } from '@internal/wait-for-run-result';
import { BaseError } from '@internal/errors';
import { ClientContext } from '@internal/context/client-context';
import { ExecutionContext } from '@internal/context/execution-context';

export type RunResult<TReturn> =
  | { error: BaseError | Error; success: false }
  | { data: TReturn; success: true };

export interface Run<TReturn = unknown> {
  id: string;
  getStatus: () => Promise<RunStatus>;
  waitForResult: () => Promise<RunResult<TReturn>>;
}

export function createRunHandle<TReturn = unknown>(
  runtimeContext: RuntimeContext | ClientContext | ExecutionContext,
  id: string,
): Run<TReturn> {
  return {
    id,
    getStatus: () => getRunStatus(runtimeContext, id),
    waitForResult: () => waitForRunResult<TReturn>(runtimeContext, id),
  };
}
