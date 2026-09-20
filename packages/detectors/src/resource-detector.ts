/**
 * Resource-based technology detector.
 *
 * Inspects `SiteSnapshot.resources` — the resources observed by the
 * crawler during Step 6H (robots.txt, manifest.json, same-origin CSS) —
 * and produces `Detection` objects for known technology signatures.
 *
 * This detector is **signature-based** and **conservative**. It matches
 * well-known, strong content fingerprints found in the *body* of
 * observed resources. It does NOT claim that a generic resource URL or
 * content fragment implies a technology — only highly specific
 * signatures are included.
 *
 * The detector works exclusively on already-captured `Resource` objects.
 * It does **not** make network requests, re-parse HTML, or execute
 * JavaScript. The crawler's HTTP observation (Step 6H) is the sole
 * source of resource data.
 *
 * Supported signatures:
 *
 * | Resource type | Content contains    | Technology | Category          | Confidence |
 * | ------------- | -------------------- | ---------- | ----------------- | ---------- |
 * | `robots`      | `wp-admin`          | WordPress  | `cms`             | 90         |
 * | `robots`      | `wp-includes`       | WordPress  | `cms`             | 90         |
 * | `manifest`    | `gcm_sender_id`     | Firebase   | `service_worker`  | 95         |
 * | `css`         | `--wp--preset--`    | WordPress  | `cms`             | 95         |
 * | `css`         | `wp-block-`         | WordPress  | `cms`             | 90         |
 * | `css`         | `@tailwind`         | Tailwind   | `library`         | 85         |
 *
 * The detector:
 * - matches resource `content` case-insensitively (substring match)
 * - matches signatures **only** on resources of the corresponding `type`
 *   (a `wp-admin` signature never matches a `css` or `manifest` resource)
 * - produces **one detection per technology**; when multiple signatures
 *   match the same technology, the **highest confidence** is preserved
 *   (on ties, the first signature in table order wins) and evidence
 *   from all matching signatures is merged deterministically
 * - returns `[]` when no signatures match
 * - never throws for missing, empty, or malformed resource data
 *
 * Cross-detector deduplication (e.g. WordPress already detected by
 * `MetaTagDetector`) is handled by `DeduplicatingDetector`.
 *
 * @see {@link Detector}
 */

import type {
  Detection,
  SiteSnapshot,
  Technology,
  ResourceType,
  Evidence,
  TechnologyVersion,
} from '@devlens/core';
import { createConfidence, createDetection } from '@devlens/core';
import type { Detector } from './detector.js';
import { getTechnology } from './technology-catalog.js';
import { getEvidenceKey } from './evidence-key.js';
import { extractVersion, type VersionExtraction } from './version.js';

/**
 * A single resource-based detection signature.
 */
interface ResourceSignature {
  /** The `Resource.type` this signature applies to. */
  readonly matchType: ResourceType;
  /** Case-insensitive substring to search for in the resource `content`. */
  readonly matchContent: string;
  /** Technology ID — lookup key in {@link TECHNOLOGY_CATALOG}. */
  readonly technologyId: string;
  /** Confidence score (0–100). */
  readonly confidence: number;
  /**
   * Optional, declarative version-extraction rule. When present, the
   * version is extracted from the matched resource content. `null` when
   * absent (the signature declares no version extraction).
   */
  readonly version?: VersionExtraction;
}

/**
 * A single match result for a signature.
 */
interface Match {
  readonly technology: Technology;
  readonly confidence: number;
  readonly evidence: Evidence;
  readonly version: TechnologyVersion | null;
}

/**
 * The supported resource signatures.
 *
 * Ordered so that more specific fingerprints are processed before
 * more general ones. Multiple signatures may match the same technology
 * (e.g. `wp-admin` and `wp-includes` both → WordPress); the detector
 * merges them into a single detection with the highest confidence and
 * combined evidence.
 */
const SIGNATURES: readonly ResourceSignature[] = [
  // ── WordPress (robots.txt) ──────────────────────────────────────
  {
    matchType: 'robots',
    matchContent: 'wp-admin',
    technologyId: 'wordpress',
    confidence: 90,
  },
  {
    matchType: 'robots',
    matchContent: 'wp-includes',
    technologyId: 'wordpress',
    confidence: 90,
  },
  // ── WordPress (CSS — very specific block-editor patterns) ───────
  {
    matchType: 'css',
    matchContent: '--wp--preset--',
    technologyId: 'wordpress',
    confidence: 95,
  },
  {
    matchType: 'css',
    matchContent: 'wp-block-',
    technologyId: 'wordpress',
    confidence: 90,
  },
  // ── Tailwind CSS ───────────────────────────────────────────────
  {
    matchType: 'css',
    matchContent: '@tailwind',
    technologyId: 'tailwind',
    confidence: 85,
  },
  // ── Firebase (manifest) ─────────────────────────────────────────
  {
    matchType: 'manifest',
    matchContent: 'gcm_sender_id',
    technologyId: 'firebase',
    confidence: 95,
  },
];

/**
 * A `Detector` that identifies technologies from observed resource
 * content (robots.txt, manifest.json, same-origin CSS).
 *
 * The detector reads `snapshot.resources` and matches each signature's
 * `matchContent` against the `content` field of resources whose `type`
 * matches `matchType`. When a match is found, a `Detection` is produced
 * with `ResourceEvidence` referencing the actual resource URL.
 *
 * Only resources observed by the crawler (Step 6H) are inspected —
 * no additional HTTP requests are made.
 *
 * @example
 * ```typescript
 * const detector = new ResourceDetector();
 * const detections = detector.detect(snapshot);
 * // → [{ technology: wordpress, confidence: 95, evidence: [{ type: 'resource', url: '...' }] }]
 * ```
 */
export class ResourceDetector implements Detector {
  /**
   * Detects technologies from observed resource content.
   *
   * Iterates all signatures in order. For each signature, finds the
   * first resource whose `type` matches and whose `content` contains the
   * signature substring (case-insensitive). Matching signatures are
   * grouped by `technologyId`. For each technology group:
   *
   * - The detection with the **highest confidence** is selected as the
   *   representative (on ties, the first signature in table order wins).
   * - Evidence from all matching signatures is merged in signature order.
   * - Exact-duplicate evidence items are removed (via `getEvidenceKey`),
   *   so the same resource URL appearing in multiple signatures is not
   *   duplicated.
   *
   * This mirrors the semantics of `DeduplicatingDetector` for the
   * single-technology case, while leaving cross-detector deduplication
   * to `DeduplicatingDetector`.
   *
   * @param snapshot — the site snapshot to inspect
   * @returns an array of detections (possibly empty if no signatures match)
   */
  detect(snapshot: SiteSnapshot): Detection[] {
    const resources = snapshot.resources;
    const groups = new Map<string, { matches: Match[] }>();
    const order: string[] = [];

    for (const sig of SIGNATURES) {
      // Find the first resource that matches this signature
      const matchedResource = resources.find((r) => {
        return r.type === sig.matchType && r.content.toLowerCase().includes(sig.matchContent);
      });

      if (matchedResource === undefined) {
        continue;
      }

      const technology = getTechnology(sig.technologyId);

      const match: Match = {
        technology,
        confidence: sig.confidence,
        evidence: {
          type: 'resource',
          url: matchedResource.url,
        },
        version: extractVersion(matchedResource.content, sig.version),
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
      const { technology, confidence, evidence, version } = this.selectBestAndMerge(group.matches);
      detections.push(createDetection(technology, createConfidence(confidence), evidence, version));
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
    version: TechnologyVersion | null;
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
      version: best.version,
    };
  }
}
