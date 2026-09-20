/**
 * HTTP Resource Intelligence — deterministic resource discovery,
 * classification, and selection.
 *
 * This module is the *pure* heart of Step 70. It contains **no I/O**: no
 * `fetch`, no filesystem. Acquisition (network I/O) lives in
 * `HttpCrawler.acquireResource`. Keeping discovery/selection pure makes them
 * trivially unit-testable and deterministic — exactly what the spec demands
 * (§14: ordering must not depend on network timing or promise completion
 * order).
 *
 * Pipeline (mirrored by the crawler when `resourceIntelligence` is set):
 *
 *   discoverResources  →  selectResources  →  acquireResource (in HttpCrawler)
 *
 * Discover turns the HTML extract into canonical `DiscoveredResource`s.
 * Select applies a deterministic budget/priority policy, partitioning them
 * into `selected` (to be fetched) and `skipped` (excluded, with a reason).
 * Acquire (in the crawler) turns each selected resource into a fetched or
 * failed `Resource` observation.
 */

import type { HttpHeader, ResourceType, ResourceAcquisitionStatus } from '@devlens/core';
import type { HtmlExtract } from './html-parser.js';

// ─── Policy ──────────────────────────────────────────────────────────

/**
 * Deterministic policy controlling secondary-resource intelligence.
 *
 * Every field has an explicit default (see {@link DEFAULT_RESOURCE_POLICY})
 * that is justified in `docs/Step70-http-resource-intelligence.md`. The
 * numbers are chosen to protect a scan from pathological pages while leaving
 * ample budget for technology-relevant signals (JS/CSS).
 */
export interface ResourcePolicy {
  /** Total secondary resources to acquire (selected + fetched/failed/skipped counted against this). */
  readonly maxTotal: number;
  /** Per-kind cap. Kinds absent from the map are treated as 0 (excluded). */
  readonly maxPerKind: Readonly<Record<ResourceType, number>>;
  /** Maximum bytes to read from any single resource body. */
  readonly maxBodyBytes: number;
  /** Per-resource request timeout in milliseconds. */
  readonly timeoutMs: number;
  /** Maximum redirects to follow when acquiring a resource. */
  readonly maxRedirects: number;
  /** Priority order for selection (highest first). */
  readonly priority: readonly ResourceType[];
  /**
   * Whether cross-origin resources may be acquired.
   * Default `false` — reuses the existing same-origin SSRF guard
   * (`isResourceUrlAllowed`). Setting this true does NOT bypass SSRF;
   * private/loopback/unusual-scheme checks still apply.
   */
  readonly allowExternal: boolean;
  /** Which resource sources to discover at all. */
  readonly observeRobots: boolean;
  readonly observeManifest: boolean;
  readonly observeScripts: boolean;
  readonly observeStylesheets: boolean;
  readonly observeFavicons: boolean;
}

/**
 * Default policy. Justifications:
 * - `maxTotal: 40` — a pathological page might reference hundreds of
 *   scripts/styles; 40 is enough for real signal while bounding work.
 * - `maxBodyBytes: 524288` (512 KiB) — large enough for JS/CSS fingerprints,
 *   small enough to bound memory.
 * - `timeoutMs: 5_000` — secondary requests are best-effort; a slow CDN
 *   edge should not hang a scan.
 * - images/fonts are zero-budget by default (§4) — they rarely carry
 *   technology fingerprints and would waste the intelligence budget.
 */
export const DEFAULT_RESOURCE_POLICY: ResourcePolicy = {
  maxTotal: 40,
  maxPerKind: {
    script: 20,
    stylesheet: 0,
    css: 10,
    image: 0,
    font: 0,
    video: 0,
    audio: 0,
    document: 0,
    robots: 8,
    manifest: 4,
    favicon: 4,
    other: 8,
  },
  maxBodyBytes: 524_288,
  timeoutMs: 5_000,
  maxRedirects: 5,
  priority: [
    'script',
    'stylesheet',
    'css',
    'favicon',
    'manifest',
    'robots',
    'image',
    'font',
    'other',
  ],
  allowExternal: false,
  observeRobots: true,
  observeManifest: true,
  observeScripts: true,
  observeStylesheets: true,
  observeFavicons: true,
};

// ─── Intermediate types ─────────────────────────────────────────────

/**
 * A resource discovered from HTML markup, before acquisition. The `kind` is
 * the classifier's best guess from HTML context (a `<script src>` is a
 * `script`, a `<link rel=stylesheet>` is `css` for ResourceDetector
 * compatibility, etc.).
 */
export interface DiscoveredResource {
  /** Canonical absolute URL of the resource. */
  readonly url: string;
  /** Best-effort kind from discovery context. */
  readonly kind: ResourceType;
  /** The page URL that referenced this resource. */
  readonly sourcePage: string;
}

/**
 * A resource that survived selection and is ready to be acquired.
 */
export type SelectedResource = DiscoveredResource;

/**
 * Result of selection: the resources to fetch, plus the ones excluded (with
 * a human-readable reason) so the "why was this skipped?" question is
 * answer-able (§6).
 */
export interface SelectionResult {
  readonly selected: readonly SelectedResource[];
  readonly skipped: readonly DiscoveredResource[];
}

// ─── Canonicalization ────────────────────────────────────────────────

/**
 * Normalizes a candidate URL to a canonical absolute form for dedup.
 *
 * - Resolves relative URLs against `pageUrl`.
 * - Lowercases the scheme/host (URL standard behavior).
 * - Drops the fragment (irrelevant for resource identity).
 * - Strips a single trailing dot from the host (legacy).
 *
 * Returns `null` for malformed/empty URLs, or for non-http(s) schemes
 * (these are filtered by the caller via the SSRF guard later).
 */
export function canonicalizeUrl(candidate: string, pageUrl: string): string | null {
  if (candidate.trim() === '') {
    return null;
  }
  let resolved: URL;
  try {
    resolved = new URL(candidate, pageUrl);
  } catch {
    return null;
  }
  // Only http/https may ever be resource candidates.
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    return null;
  }
  resolved.hash = '';
  resolved.host = resolved.host.replace(/\.$/, '');
  return resolved.href;
}

// ─── Discovery ───────────────────────────────────────────────────────

/** Set of rel tokens (lowercased) that mark a favicon link. */
function relTokens(rel: string | null): readonly string[] {
  if (!rel) {
    return [];
  }
  return rel
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function isFaviconRel(rel: string | null): boolean {
  const tokens = relTokens(rel);
  if (tokens.length === 0) {
    return false;
  }
  return (
    tokens.includes('icon') || tokens.includes('apple-touch-icon') || tokens.includes('mask-icon')
  );
}

/**
 * Discovers secondary resources from a parsed HTML extract.
 *
 * Produces a deterministic, de-duplicated list ordered by
 * `(policy.priority, canonicalUrl)`. The `kind` is derived from HTML
 * context only (no network): `<script src>`→`script`, stylesheet links→`css`
 * (so `ResourceDetector` signatures still match), favicons→`favicon`,
 * manifest links→`manifest`, and the page origin's `robots.txt`→`robots`.
 */
export function discoverResources(
  html: HtmlExtract,
  pageUrl: string,
  policy: ResourcePolicy = DEFAULT_RESOURCE_POLICY,
): DiscoveredResource[] {
  const origin = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return null;
    }
  })();

  const found: DiscoveredResource[] = [];

  // robots.txt — always discovered from the page origin (when enabled).
  if (policy.observeRobots && origin !== null) {
    found.push({ url: `${origin}/robots.txt`, kind: 'robots', sourcePage: pageUrl });
  }

  // manifest — first <link rel="manifest" href>.
  if (policy.observeManifest && html.manifestLink !== null) {
    const url = canonicalizeUrl(html.manifestLink, pageUrl);
    if (url !== null) {
      found.push({ url, kind: 'manifest', sourcePage: pageUrl });
    }
  }

  // scripts — external src only (inline scripts carry their content inline
  // already; fetching the same URL is the observable).
  if (policy.observeScripts) {
    for (const script of html.scripts) {
      if (script.src !== null) {
        const url = canonicalizeUrl(script.src, pageUrl);
        if (url !== null) {
          found.push({ url, kind: 'script', sourcePage: pageUrl });
        }
      }
    }
  }

  // stylesheets — classify as 'css' so ResourceDetector (matchType 'css')
  // continues to match fetched CSS bodies.
  if (policy.observeStylesheets) {
    for (const href of html.stylesheetLinks) {
      const url = canonicalizeUrl(href, pageUrl);
      if (url !== null) {
        found.push({ url, kind: 'css', sourcePage: pageUrl });
      }
    }
  }

  // favicons — <link rel="icon|shortcut icon|apple-touch-icon|...">.
  if (policy.observeFavicons) {
    for (const tag of html.linkTags) {
      if (isFaviconRel(tag.rel)) {
        const href = tag.href;
        if (href !== null && href.trim() !== '') {
          const url = canonicalizeUrl(href, pageUrl);
          if (url !== null) {
            found.push({ url, kind: 'favicon', sourcePage: pageUrl });
          }
        }
      }
    }
  }

  // Deterministic ordering + canonical de-duplication.
  const byUrl = new Map<string, DiscoveredResource>();
  for (const r of found) {
    if (!byUrl.has(r.url)) {
      byUrl.set(r.url, r); // first occurrence wins (document order)
    }
  }
  return Array.from(byUrl.values()).sort((a, b) => compareByPriorityThenUrl(a, b, policy));
}

// ─── Classification ─────────────────────────────────────────────────

/** Maps a response Content-Type media type to a resource kind, if confident. */
function kindFromContentType(contentType: string | null): ResourceType | null {
  if (!contentType) {
    return null;
  }
  const media = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (
    media === 'text/javascript' ||
    media === 'application/javascript' ||
    media === 'text/ecmascript' ||
    media === 'application/ecmascript' ||
    media === 'text/jsx' ||
    media === 'module'
  ) {
    return 'script';
  }
  if (
    media === 'text/css' ||
    media === 'application/css' ||
    media === 'text/x-chtml' ||
    media === 'application/x-css'
  ) {
    return 'css';
  }
  if (media === 'image/svg+xml' || media.startsWith('image/')) {
    return 'image';
  }
  if (
    media.startsWith('font/') ||
    media === 'application/vnd.ms-fontobject' ||
    media === 'application/x-font-ttf' ||
    media === 'application/x-font-woff'
  ) {
    return 'font';
  }
  if (media === 'application/manifest+json' || media === 'application/json') {
    return 'manifest';
  }
  return null;
}

/** Maps a URL path/extension to a resource kind, if confident. */
function kindFromExtension(url: string): ResourceType | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const lower = pathname.toLowerCase();
  // Strip query/hash just in case canonicalization missed them.
  const clean = lower.split(/[?#]/)[0] ?? '';
  if (
    clean.endsWith('.js') ||
    clean.endsWith('.mjs') ||
    clean.endsWith('.cjs') ||
    clean.endsWith('.jsx') ||
    clean.endsWith('.ts') ||
    clean.endsWith('.tsx')
  ) {
    return 'script';
  }
  if (clean.endsWith('.css')) {
    return 'css';
  }
  if (
    clean.endsWith('.png') ||
    clean.endsWith('.jpg') ||
    clean.endsWith('.jpeg') ||
    clean.endsWith('.gif') ||
    clean.endsWith('.svg') ||
    clean.endsWith('.ico') ||
    clean.endsWith('.webp') ||
    clean.endsWith('.avif')
  ) {
    return 'image';
  }
  if (
    clean.endsWith('.woff') ||
    clean.endsWith('.woff2') ||
    clean.endsWith('.ttf') ||
    clean.endsWith('.otf') ||
    clean.endsWith('.eot')
  ) {
    return 'font';
  }
  return null;
}

/**
 * Classifies a resource deterministically. MIME (response Content-Type)
 * overrides extension/extension-derived kind only when it is confident;
 * ambiguous resources are preserved as `other` rather than invented (§3).
 */
export function classifyResource(
  url: string,
  declaredKind: ResourceType,
  contentType: string | null = null,
): ResourceType {
  // Strong response Content-Type always wins when confident.
  const fromMime = kindFromContentType(contentType);
  if (fromMime !== null) {
    // A favicon served as image/* stays favicon (semantic kind), not image.
    if (declaredKind === 'favicon' && fromMime === 'image') {
      return 'favicon';
    }
    return fromMime;
  }

  // Favicon declared by HTML context is a strong signal on its own.
  if (declaredKind === 'favicon') {
    return 'favicon';
  }

  // Extension fallback.
  const fromExt = kindFromExtension(url);
  if (fromExt !== null) {
    return fromExt;
  }

  // Keep the discovery-context kind (e.g. 'css' from a <link rel=stylesheet>),
  // but if it was a guess (e.g. 'other'), it stays 'other'.
  return declaredKind;
}

// ─── Selection ──────────────────────────────────────────────────────

function priorityIndex(kind: ResourceType, policy: ResourcePolicy): number {
  const idx = policy.priority.indexOf(kind);
  return idx === -1 ? policy.priority.length : idx;
}

/** Deterministic comparator: priority ASC, then canonical URL ASC. */
function compareByPriorityThenUrl(
  a: DiscoveredResource,
  b: DiscoveredResource,
  policy: ResourcePolicy,
): number {
  const pa = priorityIndex(a.kind, policy);
  const pb = priorityIndex(b.kind, policy);
  if (pa !== pb) {
    return pa - pb;
  }
  return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
}

/**
 * Selects which discovered resources to acquire, applying deterministic
 * total/per-kind budgets and priority ordering (§4/§6).
 *
 * `selected` preserves the deterministic ordering; `skipped` carries the
 * excluded resources (each acquires a failure reason downstream). Selection
 * is pure and stable for a given input+policy.
 */
export function selectResources(
  discovered: readonly DiscoveredResource[],
  policy: ResourcePolicy = DEFAULT_RESOURCE_POLICY,
): SelectionResult {
  const ordered = [...discovered].sort((a, b) => compareByPriorityThenUrl(a, b, policy));

  const selected: SelectedResource[] = [];
  const skipped: DiscoveredResource[] = [];
  let total = 0;
  const perKind = new Map<ResourceType, number>();

  for (const r of ordered) {
    const kindCap = policy.maxPerKind[r.kind] ?? 0;
    if (total >= policy.maxTotal) {
      skipped.push(r);
      continue;
    }
    const k = perKind.get(r.kind) ?? 0;
    if (k >= kindCap) {
      skipped.push(r);
      continue;
    }
    selected.push(r);
    total++;
    perKind.set(r.kind, k + 1);
  }

  return { selected, skipped };
}

// ─── Helpers consumed by HttpCrawler ───────────────────────────────

/** Priority index for a kind (exposed for deterministic crawler-side ordering). */
export function resourcePriority(
  kind: ResourceType,
  policy: ResourcePolicy = DEFAULT_RESOURCE_POLICY,
): number {
  return priorityIndex(kind, policy);
}

/** Stable comparator for Resource observations, used to order final output. */
export function compareResources(
  a: { type: ResourceType; url: string },
  b: { type: ResourceType; url: string },
  policy: ResourcePolicy = DEFAULT_RESOURCE_POLICY,
): number {
  const pa = resourcePriority(a.type, policy);
  const pb = resourcePriority(b.type, policy);
  if (pa !== pb) {
    return pa - pb;
  }
  return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
}

/** Re-exported so consumers don't import an extra module for the union. */
export type { ResourceType, ResourceAcquisitionStatus, HttpHeader };
