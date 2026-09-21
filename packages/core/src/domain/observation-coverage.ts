/**
 * Observation Coverage & Blind-Spot Intelligence (Step 78).
 *
 * A compact, factual, deterministic summary of *what surfaces / resources
 * DevLens actually observed* during a crawl — derived purely from the
 * existing `SiteSnapshot` (crawler-attached `Resource.acquisitionStatus`,
 * `HttpObservation`, and `HtmlObservation`).
 *
 * This NEVER claims a technology is "absent", "unused", or "not installed" —
 * it only describes DevLens's own observability. It is the single source of
 * truth for observability (Step 78 §10: "Scan → observationCoverage"),
 * attached server-side to the scan response and consumed verbatim by the UI.
 *
 * Counting semantics (documented to avoid competing definitions):
 *   - `discovered/selected/fetched/failed/skipped` aggregate ALL resources by
 *     their `acquisitionStatus` (Step 70 §5).
 *   - `sources` is the per-§4-family observation matrix.
 *   - A resource URL being discovered does NOT imply its body was inspected
 *     (§4: `resource_url` and `resource_content` stay distinct).
 *   - `failureReason` is read verbatim — never fabricated (§6).
 *
 * Properties:
 *   - Pure (no React, HTTP, DB, browser)
 *   - Synchronous / O(n)
 *   - Deterministic (sorted, no iteration-order dependence)
 *   - No IO, no DB, no React
 */

import type { Resource, SiteSnapshot } from './snapshot.js';

// ─── Source families (§4) ────────────────────────────────────────────

/**
 * The observable surfaces DevLens can inspect during a crawl. Same
 * vocabulary as the Step-76 `SourceFamily` (web contract), defined locally
 * here so the core domain layer never depends on the web package (§9.5).
 */
export type ObservationFamily =
  | 'header' // HTTP response headers
  | 'meta' // <meta> tags
  | 'content' // inline <script> bodies / js globals
  | 'script_url' // external <script src>
  | 'link' // <link href>
  | 'resource_url' // a secondary resource URL was discovered
  | 'resource_content'; // a secondary resource body was acquired

/**
 * Factual, non-collapsing observation status (§9 correction — no generic
 * `blocked` bucket). A surface whose resources failed stays distinguishable
 * from one whose resources were skipped.
 *
 * - `not_observed` — the surface is not present in the snapshot.
 * - `observed`     — every relevant resource was fetched (success).
 * - `partial`      — mixed outcomes (some fetched, some failed/skipped).
 * - `failed`       — acquisition was attempted but produced no usable
 *                    content.
 * - `skipped`      — resources were never acquired (policy/security);
 *                    none failed.
 */
export type ObservationCoverageStatus =
  'not_observed' | 'observed' | 'partial' | 'failed' | 'skipped';

// ─── Model (§3) ─────────────────────────────────────────────────────

/**
 * Factual observability summary for a single observation surface.
 *
 * `fetched`/`failed`/`skipped` are meaningful for the resource surfaces
 * (`resource_url` / `resource_content`); for the HTML / HTTP surfaces they
 * are `0` and the `status` is `observed` / `not_observed`.
 */
export interface ObservationCoverageSource {
  /** §4 observable source family. */
  readonly family: ObservationFamily;
  /** §9 factual status (never collapses failed vs skipped). */
  readonly status: ObservationCoverageStatus;
  /** Resources acquired usable content on this surface. */
  readonly fetched: number;
  /** Resources whose acquisition was attempted but failed. */
  readonly failed: number;
  /** Resources never acquired (policy/security budget). */
  readonly skipped: number;
  /** Verbatim `Resource.failureReason` values (deduped, sorted) when any —
   *  never fabricated (§6). Absent when there are no failures/skips. */
  readonly failureReasons?: readonly string[];
}

/**
 * Compact, deterministic observation coverage for a scan snapshot.
 *
 * - `discovered/selected/fetched/failed/skipped` aggregate all resources
 *   by their `acquisitionStatus` (§3 / §5).
 * - `sources` is the per-§4-family matrix.
 */
export interface ObservationCoverage {
  readonly discovered: number;
  readonly selected: number;
  readonly fetched: number;
  readonly failed: number;
  readonly skipped: number;
  readonly sources: readonly ObservationCoverageSource[];
}

// ─── Helpers ────────────────────────────────────────────────────────

const FAMILY_ORDER: ReadonlyArray<ObservationFamily> = [
  'header',
  'meta',
  'content',
  'script_url',
  'link',
  'resource_url',
  'resource_content',
];

function notObservedSource(family: ObservationFamily): ObservationCoverageSource {
  return { family, status: 'not_observed', fetched: 0, failed: 0, skipped: 0 };
}

function addReason(reasons: Set<string>, reason: string | undefined): void {
  if (reason) {
    reasons.add(reason);
  }
}

/**
 * Maps a `Resource` to its acquisition outcome for coverage purposes.
 *
 * `discovered`/`selected` (intermediate pipeline states) and legacy resources
 * with no `acquisitionStatus` are folded factually: a resource whose body was
 * acquired counts as fetched; one with no body and no attempted acquisition is
 * neither fetched/failed/skipped (its URL may still be "observed" on the
 * `resource_url` surface — §4). `failureReason` is read verbatim (§6).
 */
interface ResourceOutcome {
  readonly fetched: boolean;
  readonly failed: boolean;
  readonly skipped: boolean;
  readonly hasContent: boolean;
}

function classifyResource(resource: Resource): ResourceOutcome {
  const hasContent = resource.content.length > 0;
  switch (resource.acquisitionStatus) {
    case 'fetched':
      return { fetched: true, failed: false, skipped: false, hasContent };
    case 'failed':
      return { fetched: false, failed: true, skipped: false, hasContent: false };
    case 'skipped':
      return { fetched: false, failed: false, skipped: true, hasContent: false };
    case 'discovered':
    case 'selected':
      // URL known, body never acquired, nothing attempted-and-failed.
      return { fetched: false, failed: false, skipped: false, hasContent: false };
    case undefined:
      // Legacy controlled-observation resource (pre-Step-70): content present
      // means it was effectively acquired (fetched); no content = not acquired.
      return hasContent
        ? { fetched: true, failed: false, skipped: false, hasContent }
        : { fetched: false, failed: false, skipped: false, hasContent: false };
    default:
      // Exhaustiveness guard: an unexpected/intermediate status is treated as
      // URL-known-but-not-acquired (distinct from fetched/failed/skipped — §4/§7).
      return { fetched: false, failed: false, skipped: false, hasContent: false };
  }
}

/**
 * Computes the coverage source for a resource surface.
 *
 * `contentOnly` selects between the URL surface (`resource_url`, where any
 * resource with a URL is "observed") and the body surface (`resource_content`,
 * where only acquired content counts).
 */
function resourceSource(
  resources: readonly Resource[],
  contentOnly: boolean,
): ObservationCoverageSource {
  let fetched = 0;
  let failed = 0;
  let skipped = 0;
  let observedOnly = 0;
  const reasons = new Set<string>();

  for (const resource of resources) {
    const outcome = classifyResource(resource);
    const isFetched = contentOnly ? outcome.fetched && outcome.hasContent : outcome.fetched;
    if (isFetched) {
      fetched++;
    } else if (outcome.failed) {
      failed++;
      addReason(reasons, resource.failureReason);
    } else if (outcome.skipped) {
      skipped++;
      addReason(reasons, resource.failureReason);
    } else {
      // discovered / selected / legacy without content: URL known but no
      // acquisition — distinct from fetched/failed/skipped (§4 / §7).
      observedOnly++;
    }
  }

  const status = resourceStatus(fetched, failed, skipped, observedOnly, contentOnly);
  const base: ObservationCoverageSource = {
    family: contentOnly ? 'resource_content' : 'resource_url',
    status,
    fetched,
    failed,
    skipped,
  };
  if (reasons.size > 0) {
    return { ...base, failureReasons: [...reasons].sort() };
  }
  return base;
}

function resourceStatus(
  fetched: number,
  failed: number,
  skipped: number,
  observedOnly: number,
  contentOnly: boolean,
): ObservationCoverageStatus {
  const total = fetched + failed + skipped + observedOnly;
  if (total === 0) {
    return 'not_observed';
  }
  const hasFetched = fetched > 0;
  const hasFailed = failed > 0;
  const hasSkipped = skipped > 0;
  const hasObservedOnly = observedOnly > 0;

  if (hasFailed || hasSkipped) {
    // Some resources were attempted-or-skipped (never inferred as a single
    // bucket — §9 correction).
    if (hasFetched) {
      return 'partial'; // fetched alongside failures/skips
    }
    if (hasFailed && hasSkipped) {
      return 'partial'; // mixed failure + skip, no success
    }
    return hasFailed ? 'failed' : 'skipped';
  }

  // No failures/skips:
  if (hasFetched) {
    return hasObservedOnly ? 'partial' : 'observed'; // fetched + URL-only
  }
  // fetched === 0 and no failures/skips: only observedOnly (URL discovered).
  return contentOnly ? 'not_observed' : 'observed';
}

function presentSurface(family: ObservationFamily, count: number): ObservationCoverageSource {
  return {
    family,
    status: count > 0 ? 'observed' : 'not_observed',
    fetched: 0,
    failed: 0,
    skipped: 0,
  };
}

const EMPTY_COVERAGE: ObservationCoverage = {
  discovered: 0,
  selected: 0,
  fetched: 0,
  failed: 0,
  skipped: 0,
  sources: FAMILY_ORDER.map((family) => notObservedSource(family)),
};

/**
 * Empty / absent-snapshot coverage (Step 78). Used as the default when a
 * scan has no snapshot (e.g. a failed scan) — every surface is
 * `not_observed` and all resource counts are `0`.
 */
export const EMPTY_OBSERVATION_COVERAGE: ObservationCoverage = EMPTY_COVERAGE;

// ─── Pure coverage function ─────────────────────────────────────────

/**
 * Produces a deterministic `ObservationCoverage` from a `SiteSnapshot`.
 *
 * Counts resources by `acquisitionStatus` (§5) and evaluates each §4
 * observation surface. Does not mutate the input. Returns a readonly object.
 *
 * @param snapshot The full domain snapshot (or null/undefined when no
 *                 snapshot is available, e.g. a failed scan).
 * @returns A deterministic coverage summary (empty when `snapshot` is absent).
 */
export function getObservationCoverage(
  snapshot: SiteSnapshot | null | undefined,
): ObservationCoverage {
  if (!snapshot) {
    return EMPTY_COVERAGE;
  }

  const resources = snapshot.resources;

  let discovered = 0;
  let selected = 0;
  let fetched = 0;
  let failed = 0;
  let skipped = 0;

  for (const resource of resources) {
    switch (resource.acquisitionStatus) {
      case 'discovered':
        discovered++;
        break;
      case 'selected':
        selected++;
        break;
      case 'fetched':
        fetched++;
        break;
      case 'failed':
        failed++;
        break;
      case 'skipped':
        skipped++;
        break;
      default: {
        // Legacy controlled-observation resource (no status): content present
        // => fetched; otherwise not acquired.
        if (resource.content.length > 0) {
          fetched++;
        } else {
          skipped++;
        }
        break;
      }
    }
  }

  const scripts = snapshot.html.scripts;

  const sources: ObservationCoverageSource[] = [
    presentSurface('header', snapshot.http.headers.length),
    presentSurface('meta', snapshot.html.metaTags.length),
    presentSurface('content', scripts.filter((s) => s.content.length > 0).length),
    presentSurface('script_url', scripts.filter((s) => s.src !== null).length),
    presentSurface('link', snapshot.html.links.filter((l) => l.href !== null).length),
    resourceSource(resources, false),
    resourceSource(resources, true),
  ];

  return {
    discovered,
    selected,
    fetched,
    failed,
    skipped,
    sources,
  };
}
