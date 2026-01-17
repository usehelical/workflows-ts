import { sleep } from '../utils';

// Error detection helpers
type AnyErr = {
  code?: string;
  errno?: number;
  message?: string;
  stack?: string;
  cause?: unknown;
};

// PostgreSQL SQLSTATE error classes that are safe to retry
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const RETRY_SQLSTATE_PREFIXES = new Set([
  '08', // Connection Exception
  '40', // Transaction Rollback (deadlock_detected, serialization_failure)
  '53', // Insufficient Resources
  '55', // Object Not In Prerequisite State (lock_not_available)
  '57', // Operator Intervention (admin_shutdown, cannot_connect_now)
]);

const RETRY_SQLSTATE_CODES = new Set([
  '40003', // statement_completion_unknown
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available
]);

// Node.js transient network error codes
const RETRY_NODE_ERRNOS = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EPIPE',
]);

function isPgDatabaseError(e: AnyErr): boolean {
  return !!e && typeof e === 'object' && typeof e.code === 'string' && e.code.length === 5;
}

function sqlStateLooksRetryable(sqlstate: string | undefined): boolean {
  if (!sqlstate) return false;
  if (RETRY_SQLSTATE_CODES.has(sqlstate)) return true;
  const prefix = sqlstate.toString().slice(0, 2);
  return RETRY_SQLSTATE_PREFIXES.has(prefix);
}

function nodeErrnoLooksRetryable(e: AnyErr): boolean {
  const code = e.code;
  return !!code && RETRY_NODE_ERRNOS.has(code);
}

function messageLooksRetryable(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    msg.includes('ECONNREFUSED') ||
    msg.includes('ECONNRESET') ||
    m.includes('connection timeout') ||
    m.includes('server closed the connection') ||
    m.includes('connection terminated unexpectedly') ||
    m.includes('client has encountered a connection error') ||
    m.includes('timeout exceeded when trying to connect') ||
    m.includes('could not connect to server') ||
    m.includes('connection pool exhausted') ||
    m.includes('too many clients')
  );
}

function* unwrapErrors(e: unknown): Generator<unknown, void, void> {
  const queue: unknown[] = [e];
  const seen = new Set<unknown>();

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur && typeof cur === 'object') {
      if (seen.has(cur)) continue;
      seen.add(cur);

      // AggregateError
      const ae = cur as { errors?: unknown[] };
      if (Array.isArray(ae.errors)) queue.push(...ae.errors);

      // Error cause chain
      const withCause = cur as { cause?: unknown };
      if (withCause.cause) queue.push(withCause.cause);

      // Wrapped errors
      const wrapped = cur as { error?: unknown };
      if (wrapped.error) queue.push(wrapped.error);
    }
    yield cur;
  }
}

function isRetriableDBError(err: unknown): boolean {
  for (const e of unwrapErrors(err)) {
    const anyErr = e as AnyErr;

    // Check PostgreSQL SQLSTATE codes
    if (isPgDatabaseError(anyErr) && sqlStateLooksRetryable(anyErr.code)) {
      return true;
    }

    // Check Node.js system errors
    if (nodeErrnoLooksRetryable(anyErr)) {
      return true;
    }

    // Check error messages
    if (e instanceof Error) {
      if (e.stack && messageLooksRetryable(e.stack)) return true;
      if (e.message && messageLooksRetryable(e.message)) return true;
    }
    if (messageLooksRetryable(String(e))) return true;
  }
  return false;
}

/**
 * Retry a function if it throws a retriable database error.
 * @param fn - The function to retry.
 * @param options - The options for the retry.
 * @param options.initialBackoffMs - The initial backoff time in milliseconds. Defaults to 1000.
 * @param options.maxBackoffMs - The maximum backoff time in milliseconds. Defaults to 60000.
 * @param options.onRetry - The callback to call when a retry is needed.
 * @returns The result of the function.
 */
export async function withDBRetry<T>(
  fn: () => Promise<T>,
  options: {
    initialBackoffMs?: number;
    maxBackoffMs?: number;
    onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  } = {},
): Promise<T> {
  const { initialBackoffMs = 1000, maxBackoffMs = 60000, onRetry } = options;

  let attempt = 0;
  let backoffMs = initialBackoffMs;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetriableDBError(error)) {
        // Not a retriable error - throw immediately
        throw error;
      }

      attempt++;

      // Calculate backoff with jitter (0.5x to 1.5x)
      const jitter = 0.5 + Math.random();
      const delayMs = Math.min(backoffMs * jitter, maxBackoffMs);

      // Log/callback
      if (onRetry) {
        onRetry(error, attempt, delayMs);
      } else {
        console.warn(
          `Database connection failed: ${error instanceof Error ? error.message : String(error)}. ` +
            `Retrying in ${(delayMs / 1000).toFixed(2)}s (attempt ${attempt})`,
        );
      }

      // Wait before retrying
      await sleep(delayMs);

      // Increase backoff for next attempt (exponential)
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
    }
  }
}
