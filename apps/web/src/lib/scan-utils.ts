/**
 * Pure helper functions for the scan lifecycle.
 *
 * These functions determine whether a scan is in a terminal state
 * (completed/failed) or a non-terminal state (pending/running). They
 * are used by both the `ScanLifecycle` client component (to decide
 * whether to start/stop polling) and by the presentation components
 * (to render the correct state).
 *
 * Keeping these as pure functions makes them trivially testable without
 * React or a DOM environment.
 */

/**
 * The polling interval in milliseconds.
 *
 * Uses a conservative 2.5 seconds — fast enough to feel responsive to
 * the user, slow enough to avoid overwhelming the API.
 */
export const POLLING_INTERVAL_MS = 2500;

/**
 * Returns `true` if the scan is in a terminal state (completed or failed).
 *
 * Terminal states do not require polling — the scan result will not change.
 */
export function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed';
}

/**
 * Returns `true` if the scan is in a non-terminal (in-progress) state
 * (pending or running).
 *
 * Non-terminal states require polling to observe lifecycle changes.
 */
export function isScanning(status: string): boolean {
  return status === 'pending' || status === 'running';
}
