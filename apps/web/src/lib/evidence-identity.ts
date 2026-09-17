/**
 * Canonical evidence identity — pure, deterministic, shared utility.
 *
 * This is the single source of truth for evidence identity across the
 * entire DevLens web UI. Every module that needs to determine whether
 * two evidence items represent "the same evidence" must use
 * `getEvidenceIdentity()`.
 *
 * The algorithm preserves the behavior established by Steps 38–41:
 * each evidence type uses its type-specific primary identifier field.
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
 * Produces the canonical identity string for an evidence item.
 *
 * Two evidence items produce the same identity if and only if they
 * represent "the same evidence" — same type and same identifying fields.
 *
 * - `html`               → `"html:{selector}"`
 * - `http_header`        → `"http_header:{name}"`
 * - `script_url`         → `"script_url:{url}"`
 * - `script_content`     → `"script_content:{snippet}"`
 * - `meta_tag`           → `"meta_tag:{name}"`
 * - `javascript_global`  → `"javascript_global:{globalName}"`
 * - `resource`           → `"resource:{url}"`
 * - `link`               → `"link:{url}"`
 * - unknown              → `"{type}:{JSON.stringify(item)}"`
 *
 * @param item A single evidence observation
 * @returns A deterministic canonical identity key
 */
export function getEvidenceIdentity(item: EvidenceResponse): string {
  switch (item.type) {
    case 'html':
      return `html:${item.selector}`;
    case 'http_header':
      return `http_header:${item.name}`;
    case 'script_url':
      return `script_url:${item.url}`;
    case 'script_content':
      return `script_content:${item.snippet}`;
    case 'meta_tag':
      return `meta_tag:${item.name}`;
    case 'javascript_global':
      return `javascript_global:${item.globalName}`;
    case 'resource':
      return `resource:${item.url}`;
    case 'link':
      return `link:${item.url}`;
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
