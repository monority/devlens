/**
 * Link-tag-based technology detector.
 *
 * Inspects `<link>` tags already present in `SiteSnapshot.html.links`
 * and produces `Detection` objects for known technology signatures based
 * on the `href` URL.
 *
 * This detector is **signature-based** and **conservative**: it matches
 * well-known URL signatures using **structured URL analysis** — exact
 * hostname comparison for CDN domains, and path-segment matching for
 * path-based signatures. It does NOT use naive `String.includes()`
 * matching, which would produce false positives (e.g.
 * `shopifycdn.com.example.com` must NOT match Shopify).
 *
 * The detector works exclusively on already-captured `<link>` tag data
 * from the crawler's HTML observation. It does **not** make network
 * requests, re-fetch URLs, or execute JavaScript.
 *
 * Supported signatures:
 *
 * | Match kind      | Match value              | Technology   | Category     | Confidence |
 * | --------------- | ------------------------ | ------------ | ------------ | ---------: |
 * | `path_segment`  | `wp-content`             | WordPress    | `cms`        |         90 |
 * | `path_segment`  | `wp-includes`            | WordPress    | `cms`        |         90 |
 * | `path_segment`  | `wp-json`                | WordPress    | `cms`        |         90 |
 * | `hostname`      | `cdn.shopify.com`        | Shopify      | `ecommerce`  |         95 |
 * | `hostname`      | `shopifycdn.com`         | Shopify      | `ecommerce`  |         95 |
 * | `hostname`      | `fonts.googleapis.com`   | Google Fonts | `fonts`      |         90 |
 *
 * The detector:
 * - resolves each `<link>` `href` against the page URL (`snapshot.url`)
 *   so that relative URLs are handled correctly
 * - uses exact hostname matching for CDN/domain signatures (not
 *   substring matching — `shopifycdn.com.example.com` does NOT match)
 * - uses path-segment matching for path-based signatures (not substring
 *   matching — `my-wp-content` does NOT match `wp-content`)
 * - ignores `<link>` tags with `null` or empty `href`
 * - does NOT match on `rel` alone — `rel` is stored for context but
 *   is never used as a signature criterion
 * - produces **one detection per technology**; when multiple signatures
 *   match the same technology, the **highest confidence** is preserved
 *   (on ties, the first signature in table order wins) and evidence
 *   from all matching signatures is merged deterministically
 * - returns `[]` when no signatures match
 * - never throws for missing, empty, or malformed link data
 *
 * Cross-detector deduplication (e.g. WordPress already detected by
 * `HeaderDetector`) is handled by `DeduplicatingDetector`.
 *
 * @see {@link Detector}
 */

import type { Detection, SiteSnapshot, Technology, Evidence, LinkTag } from '@devlens/core';
import { createConfidence, createDetection, createUrl } from '@devlens/core';
import type { Detector } from './detector.js';
import { getTechnology } from './technology-catalog.js';
import { getEvidenceKey } from './evidence-key.js';

/**
 * The kind of matching a signature performs on the resolved URL.
 *
 * - `'hostname'` — compares the resolved URL's hostname against an
 *   expected value **exactly** (not as a substring). Used for CDN
 *   domains like `cdn.shopify.com`.
 * - `'path_segment'` — checks whether the resolved URL's pathname
 *   contains a specific path segment **exactly** (not as a substring).
 *   Used for path-based signatures like `wp-content`.
 */
type MatchKind = 'hostname' | 'path_segment';

/**
 * A single link-tag-based detection signature.
 */
interface LinkSignature {
  /** The kind of match this signature performs. */
  readonly matchKind: MatchKind;
  /** The value to match (hostname or path segment, never a glob). */
  readonly matchValue: string;
  /** Technology ID — lookup key in {@link TECHNOLOGY_CATALOG}. */
  readonly technologyId: string;
  /** Confidence score (0–100). */
  readonly confidence: number;
}

/**
 * A single match result for a signature.
 */
interface Match {
  readonly technology: Technology;
  readonly confidence: number;
  readonly evidence: Evidence;
}

/**
 * The supported link signatures.
 *
 * Ordered so that more specific fingerprints are processed before
 * more general ones. Multiple signatures may match the same technology
 * (e.g. `wp-content` and `wp-includes` both → WordPress); the detector
 * merges them into a single detection with the highest confidence and
 * combined evidence.
 */
const SIGNATURES: readonly LinkSignature[] = [
  // ── WordPress (path-segment signatures — must be exact segment match) ──
  {
    matchKind: 'path_segment',
    matchValue: 'wp-content',
    technologyId: 'wordpress',
    confidence: 90,
  },
  {
    matchKind: 'path_segment',
    matchValue: 'wp-includes',
    technologyId: 'wordpress',
    confidence: 90,
  },
  {
    matchKind: 'path_segment',
    matchValue: 'wp-json',
    technologyId: 'wordpress',
    confidence: 90,
  },
  // ── Shopify (hostname signatures — must be exact hostname match) ────────
  {
    matchKind: 'hostname',
    matchValue: 'cdn.shopify.com',
    technologyId: 'shopify',
    confidence: 95,
  },
  {
    matchKind: 'hostname',
    matchValue: 'shopifycdn.com',
    technologyId: 'shopify',
    confidence: 95,
  },
  // ── Google Fonts (hostname signature) ────────────────────────────────────
  {
    matchKind: 'hostname',
    matchValue: 'fonts.googleapis.com',
    technologyId: 'google-fonts',
    confidence: 90,
  },
];

/**
 * Checks whether a URL's hostname exactly matches the expected value.
 *
 * "Exact" means `parsed.hostname === expected` — `foo.shopifycdn.com`
 * does NOT match `shopifycdn.com`, and `shopifycdn.com.example.com`
 * does NOT match `shopifycdn.com`.
 *
 * @param href        The resolved URL string.
 * @param expected    The expected hostname.
 * @returns `true` only when the hostnames are identical.
 */
function matchesHostname(href: string, expected: string): boolean {
  try {
    const parsed = new URL(href);
    return parsed.hostname === expected;
  } catch {
    return false;
  }
}

/**
 * Checks whether a URL's pathname contains a specific path segment.
 *
 * A "path segment" is one of the components delimited by `/` in the
 * pathname. So `https://example.com/wp-content/style.css` matches the
 * segment `wp-content`, but `https://example.com/my-wp-content/`
 * does NOT — `my-wp-content` is one segment, not `wp-content`.
 *
 * @param href        The resolved URL string.
 * @param segment     The path segment to look for.
 * @returns `true` only when the segment appears as a complete path
 *          component.
 */
function matchesPathSegment(href: string, segment: string): boolean {
  try {
    const parsed = new URL(href);
    const segments = parsed.pathname.split('/');
    return segments.includes(segment);
  } catch {
    return false;
  }
}

/**
 * Checks whether a link tag's `href` matches a given signature.
 *
 * The `href` is resolved against the page URL before matching, so
 * relative URLs (e.g. `/wp-content/style.css`) are handled correctly.
 *
 * @param link     The link tag to check.
 * @param sig      The signature to match against.
 * @param pageUrl  The page URL to resolve relative hrefs against.
 * @returns The resolved URL string if the link matches, `null` otherwise.
 */
function resolveAndMatch(link: LinkTag, sig: LinkSignature, pageUrl: string): string | null {
  if (link.href === null || link.href.trim() === '') {
    return null;
  }

  let resolved: string;
  try {
    resolved = new URL(link.href, pageUrl).href;
  } catch {
    return null;
  }

  if (sig.matchKind === 'hostname') {
    if (matchesHostname(resolved, sig.matchValue)) {
      return resolved;
    }
  } else {
    if (matchesPathSegment(resolved, sig.matchValue)) {
      return resolved;
    }
  }

  return null;
}

/**
 * A `Detector` that identifies technologies from HTML `<link>` tag URLs
 * found in `SiteSnapshot.html.links`.
 *
 * The detector reads `snapshot.html.links` (an array of
 * `{ rel, href, content }` pairs) and matches each link's resolved `href`
 * URL against known technology signatures using structured URL analysis.
 * When a match is found, a `Detection` is produced with `LinkEvidence`
 * referencing the resolved URL.
 *
 * Inline links (those without an `href` attribute) are ignored — they
 * are not suitable for URL-fingerprint-based detection. The `rel`
 * attribute is never used as a sole matching criterion.
 *
 * @example
 * ```typescript
 * const detector = new LinkDetector();
 * const detections = detector.detect(snapshot);
 * // → [{ technology: shopify, confidence: 95, evidence: [{ type: 'link', url: '...' }] }]
 * ```
 */
export class LinkDetector implements Detector {
  /**
   * Detects technologies from `<link>` tag URLs in the snapshot.
   *
   * Iterates all signatures in order. For each signature, finds the
   * first link whose resolved `href` matches the signature. Matching
   * signatures are grouped by `technologyId`. For each technology group:
   *
   * - The detection with the **highest confidence** is selected as the
   *   representative (on ties, the first signature in table order wins).
   * - Evidence from all matching signatures is merged in signature order.
   * - Exact-duplicate evidence items are removed (via `getEvidenceKey`),
   *   so the same resolved URL appearing in multiple signatures is not
   *   duplicated.
   *
   * This mirrors the semantics of `ResourceDetector` for the single-
   * technology case, while leaving cross-detector deduplication to
   * `DeduplicatingDetector`.
   *
   * @param snapshot — the site snapshot to inspect
   * @returns an array of detections (possibly empty if no signatures match)
   */
  detect(snapshot: SiteSnapshot): Detection[] {
    const links = snapshot.html.links;
    const pageUrl = snapshot.url;
    const groups = new Map<string, { matches: Match[] }>();
    const order: string[] = [];

    for (const sig of SIGNATURES) {
      // Find the first link whose href matches this signature.
      // Each signature contributes at most one match (the first matching
      // link), so evidence from multiple signatures for the same technology
      // is merged below.
      let matchedLink: LinkTag | undefined;
      let resolvedUrl: string | null = null;

      for (const link of links) {
        const resolved = resolveAndMatch(link, sig, pageUrl);
        if (resolved !== null) {
          matchedLink = link;
          resolvedUrl = resolved;
          break;
        }
      }

      if (matchedLink === undefined || resolvedUrl === null) {
        continue;
      }

      const technology = getTechnology(sig.technologyId);

      const match: Match = {
        technology,
        confidence: sig.confidence,
        evidence: {
          type: 'link',
          url: createUrl(resolvedUrl),
        },
      };

      if (!groups.has(sig.technologyId)) {
        groups.set(sig.technologyId, { matches: [match] });
        order.push(sig.technologyId);
      } else {
        groups.get(sig.technologyId)!.matches.push(match);
      }
    }

    const detections: Detection[] = [];

    for (const techId of order) {
      const group = groups.get(techId)!;
      const { technology, confidence, evidence } = this.selectBestAndMerge(group.matches);
      detections.push(createDetection(technology, createConfidence(confidence), evidence));
    }

    return detections;
  }

  /**
   * Selects the best-confidence match as the representative and merges
   * evidence from all matches in the group (removing exact duplicates).
   *
   * On confidence ties, the first match (in signature order) wins.
   */
  private selectBestAndMerge(matches: Match[]): {
    technology: Technology;
    confidence: number;
    evidence: Evidence[];
  } {
    let best = matches[0]!;

    for (let i = 1; i < matches.length; i++) {
      const current = matches[i]!;
      if (current.confidence > best.confidence) {
        best = current;
      }
    }

    // Merge evidence from all matches, removing exact duplicates
    const seen = new Set<string>();
    const merged: Evidence[] = [];

    for (const match of matches) {
      const key = getEvidenceKey(match.evidence);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(match.evidence);
      }
    }

    return {
      technology: best.technology,
      confidence: best.confidence,
      evidence: merged,
    };
  }
}
