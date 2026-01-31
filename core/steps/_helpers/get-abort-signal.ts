import { getExecutionContext } from "../../internal/execution-context";

export function getAbortSignal() {
    return getExecutionContext().abortSignal;
}