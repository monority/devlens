/**
 * Scan — the central domain aggregate.
 *
 * A Scan represents a user-requested analysis of a website. It has a
 * finite lifecycle modelled as a discriminated union so that invalid
 * states (e.g. a completed scan without a completion timestamp) are
 * unrepresentable at the type level.
 *
 * Scan lifecycle is decoupled from scan results. A completed scan
 * records *that* and *when* it finished; the resulting SiteSnapshot
 * is an independent observation artifact produced by the crawler.
 */

import type { Timestamp, Url, Hostname, ScanId } from './value-objects.js';

// ─── ScanTarget ────────────────────────────────────────────────────

/**
 * The website being analyzed.
 *
 * `ScanTarget.url` is the originally requested target URL — what the
 * user asked to scan. `ScanTarget.hostname` is the hostname associated
 * with that target (derived or associated by the infrastructure layer).
 *
 * These values are supplied by infrastructure and may NOT equal the
 * final observed URL. Redirects can cause `SiteSnapshot.http.finalUrl`
 * to differ from `ScanTarget.url`.
 *
 * The hostname is stored alongside the URL rather than derived from it
 * because the association is not always a simple parse — it may involve
 * redirect chains, CDN mappings, or custom domain associations.
 */
export interface ScanTarget {
  readonly url: Url;
  readonly hostname: Hostname;
}

// ─── ScanError ─────────────────────────────────────────────────────

/**
 * Information about why a scan failed.
 */
export interface ScanError {
  readonly code: string;
  readonly message: string;
}

// ─── ScanStatus (discriminated union) ──────────────────────────────

/**
 * Lifecycle states of a {@link Scan}.
 *
 * Each variant carries only the data relevant to that lifecycle stage:
 * - **pending** — no extra data; the scan is waiting to start
 * - **running** — has a `startedAt` timestamp
 * - **completed** — has a `completedAt` timestamp
 * - **failed** — has a `failedAt` timestamp and a {@link ScanError}
 *
 * This makes invalid states unrepresentable: a completed scan always
 * has a completion timestamp and never carries result artifacts (the
 * SiteSnapshot is a separate concept).
 */
export type ScanStatus =
  | { readonly type: 'pending' }
  | { readonly type: 'running'; readonly startedAt: Timestamp }
  | { readonly type: 'completed'; readonly completedAt: Timestamp }
  | { readonly type: 'failed'; readonly failedAt: Timestamp; readonly error: ScanError };

// ─── Scan ──────────────────────────────────────────────────────────

/**
 * A user-requested analysis of a website.
 */
export interface Scan {
  readonly id: ScanId;
  readonly target: ScanTarget;
  readonly status: ScanStatus;
  readonly createdAt: Timestamp;
}

// ─── Factories ─────────────────────────────────────────────────────

/**
 * Creates a new {@link Scan} in the `pending` state.
 *
 * The caller supplies the `createdAt` timestamp so that construction
 * is deterministic and testable — the domain does not read the system
 * clock directly.
 */
export function createScan(id: ScanId, target: ScanTarget, createdAt: Timestamp): Scan {
  return {
    id,
    target,
    status: { type: 'pending' },
    createdAt,
  };
}

/**
 * Transitions a scan from `pending` to `running`.
 * @throws {Error} if the scan is not in the `pending` state.
 */
export function startScan(scan: Scan, startedAt: Timestamp): Scan {
  if (scan.status.type !== 'pending') {
    throw new Error(
      `Cannot start a scan in "${scan.status.type}" status — only "pending" scans can be started`,
    );
  }
  return {
    ...scan,
    status: { type: 'running', startedAt },
  };
}

/**
 * Transitions a scan from `running` to `completed`.
 *
 * This records only the completion timestamp. The scan result
 * (SiteSnapshot) is an independent artifact — it is produced by
 * the crawler and associated with the scan by the application layer,
 * not embedded in the lifecycle status.
 *
 * @throws {Error} if the scan is not in the `running` state.
 */
export function completeScan(scan: Scan, completedAt: Timestamp): Scan {
  if (scan.status.type !== 'running') {
    throw new Error(
      `Cannot complete a scan in "${scan.status.type}" status — only "running" scans can be completed`,
    );
  }
  return {
    ...scan,
    status: {
      type: 'completed',
      completedAt,
    },
  };
}

/**
 * Transitions a scan to the `failed` state with an error description.
 *
 * A scan can fail from either `pending` or `running` — it has not yet
 * reached a terminal state.
 * @throws {Error} if the scan is already `completed` or `failed`.
 */
export function failScan(scan: Scan, error: ScanError, failedAt: Timestamp): Scan {
  if (scan.status.type === 'completed' || scan.status.type === 'failed') {
    throw new Error(
      `Cannot fail a scan in "${scan.status.type}" status — terminal scans cannot transition`,
    );
  }
  return {
    ...scan,
    status: {
      type: 'failed',
      failedAt,
      error,
    },
  };
}
