/**
 * Policy seam for run recovery.
 *
 * The default implementation is LocalReaper (in-process heartbeat + reaper
 * loops). An external coordinator (DBOS Conductor-style) can implement this
 * interface and be injected via createWorker({ coordinator }) — the
 * RecoveryStore DB primitives remain the enforcement layer regardless.
 */
export interface RecoveryCoordinator {
  start(): void;
  stop(): void;
}
