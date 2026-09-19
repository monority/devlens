/**
 * Canonical evidence identity — pure, deterministic, shared utility.
 *
 * This is the single source of truth for evidence identity across the
 * entire DevLens web UI. Every module that needs to determine whether
 * two evidence items represent "the same evidence" must use
 * `getEvidenceIdentity()`.
 *
 * The identity includes ALL fields that distinguish one evidence item
 * from another of the same type, and normalizes URL fields to lowercase
 * for comparison. This mirrors the canonical rules already used by the
 * detector layer (`getEvidenceKey` in `@devlens/detectors`), so the web
 * layer never silently drops evidence that the detector layer kept
 * distinct (see Step 63 — Phase 2).
 *
 * The default (unknown) case serializes the full item so that the
 * identity is deterministic but unique.
 *
 * This module is:
 * - Pure (no side effects, no I/O)
 * - Deterministic (same input → same output)
 * - Independent of React, HTTP, and the database
 * - Independently testable
 */

import type { EvidenceResponse } from './types.js';

/**
 * Normalizes a URL string to lowercase for comparison.
 *
 * URLs are case-insensitive in the hostname portion. Lowercasing the
 * whole URL here keeps the web layer's identity comparable to the
 * detector layer's canonical key (`getEvidenceKey`), which does the same.
 */
function normalizeUrl(url: string): string {
  return String(url).toLowerCase();
}

/**
 * Produces the canonical identity string for an evidence item.
 *
 * Two evidence items produce the same identity if and only if they
 * represent "the same evidence" — same type and same identifying fields.
 *
 * - `html`               → `"html:{selector}|{snippet}"`
 * - `http_header`        → `"http_header:{name}|{value}"`
 * - `script_url`         → `"script_url:{url}"` (URL lowercased)
 * - `script_content`     → `"script_content:{snippet}"`
 * - `meta_tag`           → `"meta_tag:{name}|{content}"`
 * - `javascript_global`  → `"javascript_global:{globalName}"`
 * - `resource`           → `"resource:{url}"` (URL lowercased)
 * - `link`               → `"link:{url}"` (URL lowercased)
 * - unknown              → `"{type}:{JSON.stringify(item)}"`
 *
 * @param item A single evidence observation
 * @returns A deterministic canonical identity key
 */
export function getEvidenceIdentity(item: EvidenceResponse): string {
  switch (item.type) {
    case 'html':
      return `html:${item.selector}|${item.snippet}`;
    case 'http_header':
      return `http_header:${item.name}|${item.value}`;
    case 'script_url':
      return `script_url:${normalizeUrl(item.url)}`;
    case 'script_content':
      return `script_content:${item.snippet}`;
    case 'meta_tag':
      return `meta_tag:${item.name}|${item.content}`;
    case 'javascript_global':
      return `javascript_global:${item.globalName}`;
    case 'resource':
      return `resource:${normalizeUrl(item.url)}`;
    case 'link':
      return `link:${normalizeUrl(item.url)}`;
    default: {
      // Fallback for unknown/future evidence types — serialize the full
      // item so identity is deterministic but unique. Uses the actual
      // type as prefix (consistent with the known-type pattern).
      const unknown = item as { type: string; [key: string]: unknown };
      return `${unknown.type}:${JSON.stringify(unknown)}`;
    }
  }
}

/**
 * Deduplicates evidence items using the canonical identity key.
 *
 * Preserves the order of first occurrence. Does not mutate the input array.
 *
 * @param evidence Array of evidence items (possibly with duplicates)
 * @returns New array with duplicates removed (first occurrence wins)
 */
export function deduplicateEvidence(evidence: readonly EvidenceResponse[]): EvidenceResponse[] {
  const seen = new Set<string>();
  const result: EvidenceResponse[] = [];
  for (const item of evidence) {
    const id = getEvidenceIdentity(item);
    if (!seen.has(id)) {
      seen.add(id);
      result.push(item);
    }
  }
  return result;
}
