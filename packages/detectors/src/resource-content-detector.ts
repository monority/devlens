/**
 * Resource-content-based technology detector (Step 71).
 *
 * Inspects `SiteSnapshot.resources` — the resources acquired by the
 * crawler's Step-70 resource-intelligence layer (fetched secondary JS/CSS
 * bundles) — and produces `Detection` objects for technology-specific
 * fingerprints found **inside the body** of those resources.
 *
 * This is the **content** sibling of {@link ResourceDetector}:
 *
 * | Detector               | Matches | Observation type   | Evidence shape            |
 * | ---------------------- | ------- | ------------------ | ------------------------- |
 * | `ResourceDetector`     | URL     | `resource`         | `ResourceEvidence{url}`    |
 * | `ResourceContentDetector` | body | `resource_content` | `ResourceContentEvidence{url,resourceType,match,snippet}` |
 *
 * The detector is **signature-based** and **conservative**: only strong,
 * minification-robust, technology-specific tokens are declared in the
 * catalog (e.g. Angular's `@angular/core` import specifier, Vue 3's
 * `@vue/runtime-dom`, Svelte's `svelte/internal`, Astro's `__astro`).
 * It does NOT perform generic string hunting (§7): bare `react`/`vue`/
 * `component`/`router` substrings are never used.
 *
 * The detector works **exclusively** on already-captured `Resource`
 * bodies. It makes **no** network requests, does NOT re-parse HTML, does
 * NOT execute JavaScript, and has no browser/minification-engine
 * dependency (§3 non-goals). The crawler's fetched resource body is the
 * sole source of data.
 *
 * ## Determinism & order-independence (§12, §13)
 *
 * `detect(snapshot)` is a pure function of its input. When several
 * resources of the same kind satisfy a signature, the **lexicographically
 * smallest** resource URL is chosen as the evidence source — so the
 * detection result (including the evidence URL) is identical regardless
 * of the order in which the crawler returned resources in `snapshot.resources`.
 *
 * ## Budgets & partial bodies (§11)
 *
 * Only resources that carry a captured body are inspected. Under the
 * Step-70 invariant, a resource's `content` is non-empty **only** when
 * acquisition succeeded within `maxBodyBytes`; failed/skipped/discovered
 * resources carry an empty body (and oversized bodies fail acquisition
 * rather than truncating — see `readBodyWithLimit`). Consequently an
 * empty `content` is treated as "no body available" and is never
 * analyzed as a (truncated) proof.
 *
 * ## Evidence (§5, §10)
 *
 * Each produced evidence item carries: the resource `url`, the
 * `resourceType` inspected, the `match` (the discriminating signature
 * token), and a **bounded `snippet`** — a short window of context around
 * the first match. The full bundle is never stored in evidence.
 *
 * @see {@link Detector}
 * @see {@link ResourceDetector}
 */

import type {
  Detection,
  SiteSnapshot,
  Technology,
  Evidence,
  TechnologyVersion,
} from '@devlens/core';
import { createConfidence, createDetection } from '@devlens/core';
import type { Detector } from './detector.js';
import { getTechnology } from './technology-catalog.js';
import { getEvidenceKey } from './evidence-key.js';
import { extractVersion } from './version.js';
import { signaturesFor } from './catalog/index.js';
import type { ResourceContentSignature } from './catalog/types.js';

/**
 * Radius (in characters) of context retained on each side of the match
 * when building the evidence snippet. The full resource body is never
 * stored — only this bounded window.
 */
const SNIPPET_RADIUS = 48;
/** Hard upper bound on the flattened, whitespace-collapsed snippet. */
const SNIPPET_MAX = 120;

/** A single content-body match result for a signature. */
interface Match {
  readonly technology: Technology;
  readonly confidence: number;
  readonly evidence: Evidence;
  readonly version: TechnologyVersion | null;
}

/**
 * The supported resource-content signatures, sourced declaratively from
 * the per-technology catalog (`catalog/technologies/*.ts` →
 * `resourceContentSignatures`). Sibling of `ResourceDetector`'s
 * `ResourceSignature` table.
 */
const SIGNATURES: readonly ResourceContentSignature[] = signaturesFor('resource_content');

/**
 * Builds a bounded, single-line snippet of `content` around the first
 * occurrence of `matchContent` (case-insensitive).
 *
 * - Collapses runs of whitespace into a single space so minified
 *   (single-line) and pretty (multi-line) sources both yield readable,
 *   deterministic snippets (§8).
 * - Caps length at {@link SNIPPET_MAX} and never returns more than
 *   `{SNIPPET_RADIUS}` characters of context on either side of the match
 *   (§10/§11 — never the full bundle).
 * - Returns `''` when the content does not contain the match (callers
 *   only invoke this on confirmed matches).
 */
function boundedSnippet(content: string, matchContent: string): string {
  const lowerContent = content.toLowerCase();
  const lowerMatch = matchContent.toLowerCase();
  const idx = lowerContent.indexOf(lowerMatch);
  if (idx === -1) {
    return '';
  }
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(content.length, idx + matchContent.length + SNIPPET_RADIUS);
  let snippet = content.slice(start, end);
  // Light deterministic normalization (§8): collapse whitespace so the
  // snippet is comparable across pretty/minified sources.
  snippet = snippet.replace(/\s+/g, ' ').trim();
  if (snippet.length > SNIPPET_MAX) {
    snippet = snippet.slice(0, SNIPPET_MAX);
  }
  return snippet;
}

/**
 * A `Detector` that identifies technologies from the **body** of fetched
 * resources (JS/CSS bundles acquired by the crawler's Step-70 layer).
 *
 * For each {@link ResourceContentSignature}, it scans
 * `snapshot.resources` for resources whose `type` matches `matchType`
 * and whose `content` contains `matchContent` (case-insensitive substring,
 * identical predicate to {@link ResourceDetector}). Matching signatures are
 * grouped by `technologyId`; for each group the **highest-confidence**
 * match is the representative (ties broken by first signature order) and
 * evidence from all matching signatures is merged deterministically
 * (exact duplicates removed via {@link getEvidenceKey}).
 *
 * When multiple resources satisfy a signature, the lexicographically
 * smallest resource URL is used for evidence — making the result
 * independent of resource ordering (§12) and deterministic across runs
 * (§13).
 *
 * @example
 * ```typescript
 * const detector = new ResourceContentDetector();
 * const detections = detector.detect(snapshot);
 * // → [{ technology: angular, confidence: 95,
 * //     evidence: [{ type: 'resource_content', url: '...main.js',
 * //       resourceType: 'script', match: '@angular/core', snippet: '...' }] }]
 * ```
 */
export class ResourceContentDetector implements Detector {
  /**
   * Detects technologies from fetched resource bodies.
   *
   * @param snapshot — the site snapshot to inspect
   * @returns an array of detections (possibly empty if no signatures match)
   */
  detect(snapshot: SiteSnapshot): Detection[] {
    const resources = snapshot.resources;
    const groups = new Map<string, { matches: Match[] }>();
    const order: string[] = [];

    for (const sig of SIGNATURES) {
      // Find the lexicographically-smallest resource that satisfies this
      // signature. Choosing the smallest URL (rather than the first in
      // array order) makes the evidence deterministic and independent of
      // resource ordering — §12 (order-independent) and §13 (determinism).
      let bestResource: (typeof resources)[number] | undefined;
      for (const r of resources) {
        // §11: only resources with a captured body are analysable. Under the
        // Step-70 invariant, content is non-empty only for fetched resources
        // (failed/skipped/discovered carry an empty body); oversized bodies
        // fail acquisition rather than truncate, so a non-empty body is a
        // full (bounded) proof.
        if (r.content.length === 0) {
          continue;
        }
        if (r.type !== sig.matchType) {
          continue;
        }
        if (!r.content.toLowerCase().includes(sig.matchContent)) {
          continue;
        }
        if (bestResource === undefined || r.url < bestResource.url) {
          bestResource = r;
        }
      }

      if (bestResource === undefined) {
        continue;
      }

      const technology = getTechnology(sig.technologyId);

      const match: Match = {
        technology,
        confidence: sig.confidence,
        evidence: {
          type: 'resource_content',
          url: bestResource.url,
          resourceType: sig.matchType,
          match: sig.matchContent,
          snippet: boundedSnippet(bestResource.content, sig.matchContent),
        },
        version: extractVersion(bestResource.content, sig.version),
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
   * evidence from all matches in the group (removing exact duplicates),
   * mirroring {@link ResourceDetector.selectBestAndMerge}.
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
      version: best.version,
      evidence: merged,
    };
  }
}
