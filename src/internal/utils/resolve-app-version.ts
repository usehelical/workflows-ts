/**
 * Valid charset for app_version: alphanumeric, dots, underscores, hyphens.
 * '::' is excluded because it is used as the NOTIFY payload delimiter.
 */
const VERSION_RE = /^[A-Za-z0-9._-]{1,255}$/;

export class InvalidAppVersionError extends Error {
  constructor(reason: string) {
    super(`Helical: invalid app version — ${reason}`);
    this.name = 'InvalidAppVersionError';
  }
}

/**
 * Resolves the app version for this worker process.
 *
 * Resolution order:
 *   1. Explicit value passed in code (options.appVersion)
 *   2. HELICAL_APP_VERSION environment variable
 *   3. 'dev' fallback — warns in non-production, throws in production
 *
 * A stable, unique version per deployment is required for recovery routing:
 * runs are only ever claimed by workers whose app_version matches the version
 * pinned on the run at execution start.
 *
 * Recommended values: git SHA (e.g. HELICAL_APP_VERSION=$(git rev-parse HEAD))
 * or a semantic version string injected by CI.
 */
export function resolveAppVersion(explicit?: string): string {
  const raw = explicit ?? process.env.HELICAL_APP_VERSION;

  if (raw !== undefined && raw !== '') {
    validate(raw);
    return raw;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new InvalidAppVersionError(
      'app version is required in production. ' +
        'Set options.appVersion or HELICAL_APP_VERSION (e.g. your git SHA).',
    );
  }

  console.warn(
    'Helical: no app version set — defaulting to "dev". ' +
      'Set options.appVersion or HELICAL_APP_VERSION before deploying to production. ' +
      'Without a stable version, crash recovery will not work across process restarts.',
  );
  return 'dev';
}

function validate(version: string): void {
  if (!VERSION_RE.test(version)) {
    throw new InvalidAppVersionError(
      `"${version}" must match [A-Za-z0-9._-] and be ≤ 255 characters ("::" is not allowed).`,
    );
  }
}
