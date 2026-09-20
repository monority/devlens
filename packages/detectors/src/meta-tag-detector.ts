/**
 * Meta-tag-based technology detector.
 *
 * Inspects `<meta>` tags already present in `SiteSnapshot.html.metaTags`
 * and matches them against known CMS/builder signatures.
 *
 * This detector is **signature-based**: it matches substrings
 * (case-insensitive) in the `content` attribute of `<meta name="generator">`
 * tags. It does NOT claim that every meta tag represents an application
 * technology — only well-known signatures are matched, and each produces
 * a `Detection` with explicit `MetaTagEvidence`.
 *
 * Supported signatures:
 *
 * | Meta tag name | Content contains   | Technology  | Category    | Confidence |
 * | ------------- | ------------------ | ----------- | ----------- | ---------- |
 * | `generator`   | `WordPress`        | WordPress   | `cms`       | 90         |
 * | `generator`   | `Hugo`             | Hugo        | `cms`       | 85         |
 * | `generator`   | `Jekyll`           | Jekyll      | `cms`       | 85         |
 * | `generator`   | `Ghost`            | Ghost       | `cms`       | 85         |
 * | `generator`   | `Next.js`          | Next.js     | `framework` | 85         |
 * | `generator`   | `Gatsby`           | Gatsby      | `framework` | 85         |
 * | `generator`   | `Nuxt.js`          | Nuxt.js     | `framework` | 85         |
 * | `generator`   | `PrestaShop`       | PrestaShop  | `cms`       | 90         |
 *
 * The detector:
 * - matches meta tag names case-insensitively (`generator`, `GENERATOR`,
 *   `Generator` are equivalent)
 * - matches meta tag content case-insensitively with substring matching
 * - deduplicates detections by technology ID (no duplicate entries)
 * - returns `[]` when no signatures match
 * - never throws for missing, empty, or malformed meta tags
 */

import type { Detection, SiteSnapshot } from '@devlens/core';
import { createConfidence, createDetection } from '@devlens/core';
import type { Detector } from './detector.js';
import { getTechnology } from './technology-catalog.js';
import { extractVersion } from './version.js';
import { signaturesFor } from './catalog/index.js';
import type { MetaTagSignature } from './catalog/types.js';

/**
 * The supported meta tag signatures, sourced declaratively from the
 * per-technology catalog (`catalog/technologies/*.ts`). The detector's
 * `detect()` matching logic is unchanged.
 */
const SIGNATURES: readonly MetaTagSignature[] = signaturesFor('meta');

/**
 * A `Detector` that identifies technologies from HTML `<meta>` tags.
 *
 * The detector reads `snapshot.html.metaTags` (an array of
 * `{ name: string, content: string }` pairs) and matches each signature
 * against the available meta tags. When a match is found, a `Detection`
 * is produced with `MetaTagEvidence` referencing the actual meta tag
 * name and content.
 *
 * @example
 * ```typescript
 * const detector = new MetaTagDetector();
 * const detections = detector.detect(snapshot);
 * // → [{ technology: wordpress, confidence: 90, evidence: [...] }]
 * ```
 */
export class MetaTagDetector implements Detector {
  /**
   * Detects technologies from meta tags in the snapshot.
   *
   * @param snapshot — the site snapshot to inspect
   * @returns an array of detections (possibly empty if no signatures match)
   */
  detect(snapshot: SiteSnapshot): Detection[] {
    const metaTags = snapshot.html.metaTags;
    const seen = new Set<string>();
    const detections: Detection[] = [];

    for (const sig of SIGNATURES) {
      // Skip if this technology was already detected from a prior signature
      if (seen.has(sig.technologyId)) {
        continue;
      }

      // Find the first meta tag that matches both the name and content signature.
      // Meta tag names are matched case-insensitively; content values use
      // case-insensitive substring matching.
      const matchedTag = metaTags.find((tag) => {
        return (
          tag.name.toLowerCase() === sig.tagName &&
          tag.content.toLowerCase().includes(sig.matchContent)
        );
      });

      if (matchedTag !== undefined) {
        const technology = getTechnology(sig.technologyId);
        const version = extractVersion(matchedTag.content, sig.version);

        const detection = createDetection(
          technology,
          createConfidence(sig.confidence),
          [
            {
              type: 'meta_tag',
              name: matchedTag.name,
              content: matchedTag.content,
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
