/**
 * Evidence canonicalization — produces stable, order-independent keys
 * for `Evidence` items.
 *
 * ## Purpose
 *
 * After Step 8, the `DeduplicatingDetector` and certain individual detectors
 * (ResourceDetector, LinkDetector) remove exact-duplicate evidence items.
 * Step 8 used `JSON.stringify(evidence)` for the dedup key — this works when
 * object property order is consistent, but is fragile: two evidence objects
 * with the same field values but different property insertion order would
 * serialize to different strings and fail to deduplicate.
 *
 * This module provides `getEvidenceKey` — an explicit, type-aware
 * canonicalization function that always produces the same key for the same
 * evidence content, regardless of property order. The key format is:
 *
 * ```text
 * type|normalizedField1|normalizedField2|...
 * ```
 *
 * ## Design
 *
 * - The key is deterministic and stable for identical evidence.
 * - Different evidence items produce different keys (no collisions within
 *   the same evidence type, because the key includes all distinguishing
 *   fields).
 * - The key is NOT exposed as public API data — it is a technical
 *   deduplication mechanism. It does not appear in `Detection.evidence`,
 *   API responses, or database rows.
 * - URL fields are normalized to lowercase for comparison, because
 *   `https://cdn.Shopify.com/...` and `https://cdn.shopify.com/...` are
 *   the same resource in practice.
 * - Evidence `type` is case-sensitive and never normalized.
 *
 * @see {@link Evidence}
 */

import type { Evidence } from '@devlens/core';

/**
 * Produces a canonical, deterministic key for an evidence item.
 *
 * Two evidence items are considered "the same" if and only if they produce
 * the same key. The key is used for deduplication and canonical sorting.
 *
 * @param evidence — the evidence item to canonicalize
 * @returns a stable string key in the format `type|field1|field2|...`
 */
export function getEvidenceKey(evidence: Evidence): string {
  switch (evidence.type) {
    case 'http_header':
      return `http_header|${evidence.name}|${evidence.value}`;
    case 'meta_tag':
      return `meta_tag|${evidence.name}|${evidence.content}`;
    case 'script_url':
      return `script_url|${normalizeUrl(evidence.url)}`;
    case 'script_content':
      return `script_content|${evidence.snippet}`;
    case 'javascript_global':
      return `javascript_global|${evidence.globalName}`;
    case 'resource':
      return `resource|${normalizeUrl(evidence.url)}`;
    case 'link':
      return `link|${normalizeUrl(evidence.url)}`;
    case 'resource_content':
      return `resource_content|${normalizeUrl(evidence.url)}|${evidence.resourceType}|${evidence.match}`;
    case 'html':
      return `html|${evidence.selector}|${evidence.snippet}`;
  }
}

/**
 * Normalizes a `Url` (branded string) to lowercase for comparison.
 *
 * URLs are case-insensitive in the hostname portion. In practice, the
 * crawler already resolves URLs to their canonical form, so this is a
 * defensive normalization — it ensures that two evidence items pointing
 * at the same resource with different capitalization are treated as
 * identical.
 */
function normalizeUrl(url: string): string {
  return String(url).toLowerCase();
}
