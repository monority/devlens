/**
 * Header-based technology detector.
 *
 * Inspects HTTP response headers already present in a `SiteSnapshot`
 * and produces `Detection` objects for known server/framework signatures.
 *
 * This detector is **signature-based**: it matches exact substrings
 * (case-insensitive) in specific HTTP headers. It does NOT claim that
 * every infrastructure header represents an application technology —
 * only well-known signatures are matched, and each produces a
 * `Detection` with explicit `HttpHeaderEvidence`.
 *
 * Supported signatures:
 *
 * | Header          | Value contains    | Technology  | Category    |
 * | --------------- | ----------------- | ----------- | ----------- |
 * | `Server`        | `nginx`           | nginx       | server      |
 * | `Server`        | `apache`          | Apache      | server      |
 * | `Server`        | `microsoft-iis`   | IIS         | server      |
 * | `X-Powered-By`  | `express`         | Express     | framework   |
 * | `X-Powered-By`  | `php`             | PHP         | language    |
 * | `Server`        | `cloudflare`      | Cloudflare  | cdn         |
 *
 * The detector:
 * - matches header names case-insensitively (`Server`, `server`, `SERVER` are equivalent)
 * - matches header values case-insensitively with substring matching
 * - deduplicates detections by technology ID (no duplicate entries)
 * - returns `[]` when no signatures match
 * - never throws for missing, empty, or malformed headers
 */

import type { Detection, SiteSnapshot } from '@devlens/core';
import { createConfidence, createDetection } from '@devlens/core';
import type { Detector } from './detector.js';
import { getTechnology } from './technology-catalog.js';
import { extractVersion } from './version.js';
import { signaturesFor } from './catalog/index.js';
import type { HeaderSignature } from './catalog/types.js';

/**
 * The supported header signatures, sourced declaratively from the
 * per-technology catalog (`catalog/technologies/*.ts`). The detector's
 * `detect()` matching logic is unchanged — only the *source* of the
 * signatures moved. Per-technology signature order is preserved by the
 * catalog; cross-technology order is normalized by `ScoringDetector#rank`.
 */
const SIGNATURES: readonly HeaderSignature[] = signaturesFor('header');

/**
 * A `Detector` that identifies technologies from HTTP response headers.
 *
 * The detector reads `snapshot.http.headers` (an array of
 * `{ name: string, value: string }` pairs) and matches each signature
 * against the available headers. When a match is found, a `Detection`
 * is produced with `HttpHeaderEvidence` referencing the actual header
 * name and value.
 *
 * @example
 * ```typescript
 * const detector = new HeaderDetector();
 * const detections = detector.detect(snapshot);
 * // → [{ technology: nginx, confidence: 95, evidence: [...] }]
 * ```
 */
export class HeaderDetector implements Detector {
  /**
   * Detects technologies from HTTP response headers in the snapshot.
   *
   * @param snapshot — the site snapshot to inspect
   * @returns an array of detections (possibly empty if no signatures match)
   */
  detect(snapshot: SiteSnapshot): Detection[] {
    const headers = snapshot.http.headers;
    const seen = new Set<string>();
    const detections: Detection[] = [];

    for (const sig of SIGNATURES) {
      // Skip if this technology was already detected from a prior signature
      if (seen.has(sig.technologyId)) {
        continue;
      }

      // Find the first header that matches both the name and value signature.
      // Header names are matched case-insensitively; values use case-insensitive
      // substring matching.
      const matchedHeader = headers.find((h) => {
        return (
          h.name.toLowerCase() === sig.headerName && h.value.toLowerCase().includes(sig.matchValue)
        );
      });

      if (matchedHeader !== undefined) {
        const technology = getTechnology(sig.technologyId);
        const version = extractVersion(matchedHeader.value, sig.version);

        const detection = createDetection(
          technology,
          createConfidence(sig.confidence),
          [
            {
              type: 'http_header',
              name: matchedHeader.name,
              value: matchedHeader.value,
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
