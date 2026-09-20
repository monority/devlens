/**
 * Script-URL-based technology detector.
 *
 * Inspects external JavaScript `<script>` tag URLs already present in
 * `SiteSnapshot.html.scripts` and produces `Detection` objects for known
 * technology signatures.
 *
 * This detector is **signature-based** and **conservative**: it matches
 * well-known, strong URL fingerprints (e.g. `/_next/`, `wp-content`) using
 * case-insensitive substring matching. It does NOT claim that a generic
 * JavaScript bundle means React/Vue/etc. — only signatures with strong
 * URL patterns are included.
 *
 * Supported signatures:
 *
 * | Script src contains  | Technology  | Category   | Confidence |
 * | -------------------- | ----------- | ---------- | ---------- |
 * | `wp-content`         | WordPress   | cms        | 90         |
 * | `wp-includes`        | WordPress   | cms        | 90         |
 * | `/_next/`            | Next.js     | framework  | 90         |
 * | `/_nuxt/`            | Nuxt.js     | framework   | 90         |
 * | `gatsby`             | Gatsby      | framework   | 85         |
 * | `jquery`             | jQuery      | library    | 85         |
 * | `bootstrap.`         | Bootstrap   | framework  | 80         |
 * | `lodash`             | Lodash      | library    | 80         |
 * | `woocommerce`        | WooCommerce | ecommerce | 85         |
 * | `google-analytics`   | Google Analytics | analytics | 85         |
 * | `plausible.io`       | Plausible Analytics | analytics | 90     |
 *
 * The detector:
 * - matches script `src` URLs case-insensitively (substring match)
 * - ignores inline scripts (those without a `src`)
 * - deduplicates detections by technology ID (e.g. `wp-content` and
 *   `wp-includes` both match WordPress — only one detection is produced)
 * - returns `[]` when no signatures match
 * - never throws for missing, empty, or malformed script data
 */

import type { Detection, SiteSnapshot } from '@devlens/core';
import { createConfidence, createDetection, createUrl } from '@devlens/core';
import type { Detector } from './detector.js';
import { getTechnology } from './technology-catalog.js';
import { extractVersion, type VersionExtraction } from './version.js';

/**
 * A single script-URL-based detection signature.
 */
interface ScriptUrlSignature {
  /** Case-insensitive substring to search for in the script src URL. */
  readonly matchUrl: string;
  /** Technology ID — lookup key in {@link TECHNOLOGY_CATALOG}. */
  readonly technologyId: string;
  /** Confidence score (0–100). */
  readonly confidence: number;
  /**
   * Optional, declarative version-extraction rule. When present, the
   * version is extracted from the matched script URL (the same URL that
   * produced this detection's evidence). `null` when absent.
   */
  readonly version?: VersionExtraction;
}

/**
 * The supported script URL signatures.
 *
 * Ordered so that more specific fingerprints are processed before
 * more general ones. Within the WordPress pair (`wp-content` before
 * `wp-includes`), ordering determines which URL is used as evidence
 * when both appear (though both produce the same `wordpress` detection).
 */
const SIGNATURES: readonly ScriptUrlSignature[] = [
  // ── CMS ───────────────────────────────────────────────────────
  {
    matchUrl: 'wp-content',
    technologyId: 'wordpress',
    confidence: 90,
  },
  {
    matchUrl: 'wp-includes',
    technologyId: 'wordpress',
    confidence: 90,
  },
  // ── JS Frameworks ─────────────────────────────────────────────
  {
    matchUrl: '/_next/',
    technologyId: 'nextjs',
    confidence: 90,
  },
  {
    matchUrl: '/_nuxt/',
    technologyId: 'nuxtjs',
    confidence: 90,
  },
  {
    matchUrl: 'gatsby',
    technologyId: 'gatsby',
    confidence: 85,
  },
  // ── Libraries ─────────────────────────────────────────────────
  {
    matchUrl: 'jquery',
    technologyId: 'jquery',
    confidence: 85,
    version: {
      source: 'matchedValue',
      rule: { pattern: /jquery-(\d+(?:\.\d+){0,2})/i },
    },
  },
  {
    matchUrl: 'bootstrap.',
    technologyId: 'bootstrap',
    confidence: 80,
  },
  {
    matchUrl: 'lodash',
    technologyId: 'lodash',
    confidence: 80,
    version: {
      source: 'matchedValue',
      rule: { pattern: /lodash[-@/](\d+(?:\.\d+){0,2})/ },
    },
  },
  // ── WooCommerce ───────────────────────────────────────────────
  {
    matchUrl: 'woocommerce',
    technologyId: 'woocommerce',
    confidence: 85,
  },
  // ── Google Analytics ─────────────────────────────────────────
  {
    matchUrl: 'google-analytics',
    technologyId: 'google-analytics',
    confidence: 85,
  },
  // ── Plausible Analytics ────────────────────────────────────
  {
    matchUrl: 'plausible.io',
    technologyId: 'plausible',
    confidence: 90,
  },
];

/**
 * A `Detector` that identifies technologies from external script URLs
 * found in `<script src="...">` tags.
 *
 * The detector reads `snapshot.html.scripts` (an array of
 * `{ src: string | null, content: string }` pairs) and matches each
 * script's `src` URL against known technology signatures. When a match
 * is found, a `Detection` is produced with `ScriptUrlEvidence`
 * referencing the actual script URL.
 *
 * Inline scripts (those without a `src` attribute) are ignored — they
 * are not suitable for URL-fingerprint-based detection.
 *
 * @example
 * ```typescript
 * const detector = new ScriptUrlDetector();
 * const detections = detector.detect(snapshot);
 * // → [{ technology: wordpress, confidence: 90, evidence: [...] }]
 * ```
 */
export class ScriptUrlDetector implements Detector {
  /**
   * Detects technologies from script URLs in the snapshot.
   *
   * @param snapshot — the site snapshot to inspect
   * @returns an array of detections (possibly empty if no signatures match)
   */
  detect(snapshot: SiteSnapshot): Detection[] {
    const scripts = snapshot.html.scripts;
    const seen = new Set<string>();
    const detections: Detection[] = [];

    for (const sig of SIGNATURES) {
      // Skip if this technology was already detected from a prior signature
      if (seen.has(sig.technologyId)) {
        continue;
      }

      // Find the first script with a non-null src whose URL contains
      // the signature's match substring (case-insensitive).
      const matchedScript = scripts.find((s) => {
        if (s.src === null || s.src === '') {
          return false;
        }
        return s.src.toLowerCase().includes(sig.matchUrl);
      });

      if (matchedScript !== undefined && matchedScript.src !== null) {
        const technology = getTechnology(sig.technologyId);
        const version = extractVersion(matchedScript.src, sig.version);

        const detection = createDetection(
          technology,
          createConfidence(sig.confidence),
          [
            {
              type: 'script_url',
              url: createUrl(matchedScript.src),
            },
          ],
          version,
        );

        detections.push(detection);
        seen.add(sig.technologyId);
      }
    }

    return detections;
  }
}
