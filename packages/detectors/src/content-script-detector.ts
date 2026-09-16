/**
 * Content-based technology detector.
 *
 * Inspects inline JavaScript script *content* already present in
 * `SiteSnapshot.html.scripts` and produces `Detection` objects for known
 * technology fingerprints.
 *
 * This detector is **signature-based** and **conservative**: it matches
 * well-known, strong structural fingerprints (e.g. `__NEXT_DATA__`,
 * `Vue.createApp`, `react-dom`) using case-insensitive substring matching
 * on the inline script content. It does NOT claim that a generic JavaScript
 * variable named "react" means React — only signatures with strong,
 * structural markers are included.
 *
 * Supported signatures:
 *
 * | Content contains           | Technology  | Category    | Confidence |
 * | -------------------------- | ----------- | ----------- | ---------- |
 * | `__NEXT_DATA__`            | Next.js     | framework   | 95         |
 * | `next/router`              | Next.js     | framework   | 90         |
 * | `next/navigation`          | Next.js     | framework   | 90         |
 * | `react-dom`                | React       | framework   | 90         |
 * | `ReactDOM`                 | React       | framework   | 90         |
 * | `Vue.createApp`            | Vue.js      | framework   | 95         |
 * | `@angular/core`            | Angular     | framework   | 95         |
 * | `platformBrowserDynamic`   | Angular     | framework   | 90         |
 * | `__SVELTE__`               | Svelte      | framework   | 95         |
 * | `SvelteComponent`          | Svelte      | framework   | 90         |
 * | `astro-island`             | Astro       | framework   | 95         |
 * | `drupalSettings`           | Drupal      | cms         | 90         |
 * | `window.Laravel`           | Laravel     | framework   | 90         |
 * | `Webflow.`                 | Webflow     | cms         | 90         |
 *
 * The detector:
 * - only inspects inline scripts (`src === null`), ignoring external scripts
 * - matches script content case-insensitively (substring match)
 * - deduplicates detections by technology ID (one detection per technology,
 *   using the strongest/highest-confidence signature found)
 * - stores only the matched fingerprint snippet in evidence (never the full
 *   script source)
 * - returns `[]` when no signatures match
 * - never throws for missing, empty, or malformed script data
 */

import type { Detection, SiteSnapshot } from '@devlens/core';
import { createConfidence, createDetection } from '@devlens/core';
import type { Detector } from './detector.js';
import { getTechnology } from './technology-catalog.js';

/**
 * A single content-based detection signature.
 */
interface ContentScriptSignature {
  /** Case-insensitive substring to search for in inline script content. */
  readonly matchContent: string;
  /** Technology ID — lookup key in {@link TECHNOLOGY_CATALOG}. */
  readonly technologyId: string;
  /** Confidence score (0–100). */
  readonly confidence: number;
}

/**
 * The supported inline script content signatures.
 *
 * Ordered so that higher-confidence fingerprints are processed before
 * lower-confidence ones within each technology. Within the Svelte pair
 * (`__SVELTE__` before `SvelteComponent`), ordering ensures the strongest
 * signature is used as evidence when both appear.
 */
const SIGNATURES: readonly ContentScriptSignature[] = [
  // ── Next.js ─────────────────────────────────────────────────────
  {
    matchContent: '__NEXT_DATA__',
    technologyId: 'nextjs',
    confidence: 95,
  },
  {
    matchContent: 'next/router',
    technologyId: 'nextjs',
    confidence: 90,
  },
  {
    matchContent: 'next/navigation',
    technologyId: 'nextjs',
    confidence: 90,
  },
  // ── React ───────────────────────────────────────────────────────
  {
    matchContent: 'react-dom',
    technologyId: 'react',
    confidence: 90,
  },
  {
    matchContent: 'ReactDOM',
    technologyId: 'react',
    confidence: 90,
  },
  // ── Vue ─────────────────────────────────────────────────────────
  {
    matchContent: 'Vue.createApp',
    technologyId: 'vue',
    confidence: 95,
  },
  // ── Angular ─────────────────────────────────────────────────────
  {
    matchContent: '@angular/core',
    technologyId: 'angular',
    confidence: 95,
  },
  {
    matchContent: 'platformBrowserDynamic',
    technologyId: 'angular',
    confidence: 90,
  },
  // ── Svelte ──────────────────────────────────────────────────────
  {
    matchContent: '__SVELTE__',
    technologyId: 'svelte',
    confidence: 95,
  },
  {
    matchContent: 'SvelteComponent',
    technologyId: 'svelte',
    confidence: 90,
  },
  // ── Astro ───────────────────────────────────────────────────────
  {
    matchContent: 'astro-island',
    technologyId: 'astro',
    confidence: 95,
  },
  // ── Drupal ───────────────────────────────────────────────────────
  {
    matchContent: 'drupalSettings',
    technologyId: 'drupal',
    confidence: 90,
  },
  // ── Laravel (Blade-rendered pages expose window.Laravel) ───────
  {
    matchContent: 'window.Laravel',
    technologyId: 'laravel',
    confidence: 90,
  },
  // ── Webflow ─────────────────────────────────────────────────────
  {
    matchContent: 'Webflow.',
    technologyId: 'webflow',
    confidence: 90,
  },
];

/**
 * A `Detector` that identifies technologies from inline `<script>` content
 * found in `SiteSnapshot.html.scripts`.
 *
 * The detector reads `snapshot.html.scripts` (an array of
 * `{ src: string | null, content: string }` pairs) and matches each
 * inline script's `content` against known technology signatures. External
 * scripts (those with a `src`) are ignored. When a match is found, a
 * `Detection` is produced with `ScriptContentEvidence` containing the
 * matched fingerprint snippet.
 *
 * @example
 * ```typescript
 * const detector = new ContentScriptDetector();
 * const detections = detector.detect(snapshot);
 * // → [{ technology: nextjs, confidence: 95, evidence: [{ type: 'script_content', snippet: '__NEXT_DATA__' }] }]
 * ```
 */
export class ContentScriptDetector implements Detector {
  /**
   * Detects technologies from inline script content in the snapshot.
   *
   * @param snapshot — the site snapshot to inspect
   * @returns an array of detections (possibly empty if no signatures match)
   */
  detect(snapshot: SiteSnapshot): Detection[] {
    const scripts = snapshot.html.scripts;
    const seen = new Set<string>();
    const detections: Detection[] = [];

    for (const sig of SIGNATURES) {
      // Skip if this technology was already detected from a prior (higher-confidence) signature
      if (seen.has(sig.technologyId)) {
        continue;
      }

      // Find the first inline script (src === null) whose content contains
      // the signature's match substring (case-insensitive).
      const matchedScript = scripts.find((s) => {
        if (s.src !== null) {
          return false;
        }
        return s.content.toLowerCase().includes(sig.matchContent.toLowerCase());
      });

      if (matchedScript !== undefined) {
        // Extract the actual matched text from the content, preserving
        // the original casing found in the HTML.
        const lowerContent = matchedScript.content.toLowerCase();
        const lowerSig = sig.matchContent.toLowerCase();
        const index = lowerContent.indexOf(lowerSig);
        const snippet =
          index !== -1
            ? matchedScript.content.substring(index, index + sig.matchContent.length)
            : sig.matchContent;

        const technology = getTechnology(sig.technologyId);

        const detection = createDetection(technology, createConfidence(sig.confidence), [
          {
            type: 'script_content',
            snippet,
          },
        ]);

        detections.push(detection);
        seen.add(sig.technologyId);
      }
    }

    return detections;
  }
}
