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
import { extractVersion, type VersionExtraction } from './version.js';

/**
 * A single meta-tag-based detection signature.
 */
interface MetaTagSignature {
  /** Canonical lowercase meta tag name to match (e.g. `"generator"`). */
  readonly tagName: string;
  /** Case-insensitive substring to search for in the meta tag content. */
  readonly matchContent: string;
  /** Technology ID — lookup key in {@link TECHNOLOGY_CATALOG}. */
  readonly technologyId: string;
  /** Confidence score (0–100). */
  readonly confidence: number;
  /**
   * Optional, declarative version-extraction rule. When present, the
   * version is extracted from the matched meta tag content (the same
   * content that produced this detection's evidence). `null` when absent.
   */
  readonly version?: VersionExtraction;
}

/**
 * The supported meta tag signatures.
 *
 * Ordered so that more specific matches are processed before
 * more general ones. In the current set, each technology has
 * exactly one signature, so ordering does not affect the result.
 */
const SIGNATURES: readonly MetaTagSignature[] = [
  {
    tagName: 'generator',
    matchContent: 'wordpress',
    technologyId: 'wordpress',
    confidence: 90,
    version: {
      source: 'matchedValue',
      rule: { pattern: /wordpress\s+(\d+(?:\.\d+){0,2})/i },
    },
  },
  {
    tagName: 'generator',
    matchContent: 'hugo',
    technologyId: 'hugo',
    confidence: 85,
  },
  {
    tagName: 'generator',
    matchContent: 'jekyll',
    technologyId: 'jekyll',
    confidence: 85,
  },
  {
    tagName: 'generator',
    matchContent: 'ghost',
    technologyId: 'ghost',
    confidence: 85,
  },
  {
    tagName: 'generator',
    matchContent: 'next.js',
    technologyId: 'nextjs',
    confidence: 85,
  },
  {
    tagName: 'generator',
    matchContent: 'gatsby',
    technologyId: 'gatsby',
    confidence: 85,
  },
  {
    tagName: 'generator',
    matchContent: 'nuxt.js',
    technologyId: 'nuxtjs',
    confidence: 85,
  },
  {
    tagName: 'generator',
    matchContent: 'prestashop',
    technologyId: 'prestashop',
    confidence: 90,
  },
];

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
