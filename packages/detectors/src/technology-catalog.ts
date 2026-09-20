/**
 * Centralized technology catalog — the single source of truth.
 *
 * ## Purpose
 *
 * Before Step 68 this module held a hand-authored `TECHNOLOGY_CATALOG`
 * mapping and the signature data lived separately in each detector's
 * `SIGNATURES` table. That created two risks:
 * 1. a technology's metadata (id/name/category) could diverge from its
 *    signatures, and
 * 2. a single technology's fingerprints were spread across up to six
 *    detector files.
 *
 * Step 67 introduced the architecture; Step 68 makes the catalog
 * **declarative**: every technology is described by a single
 * `TechnologyDefinition` in `catalog/technologies/<id>.ts` (metadata +
 * *all* of its signatures across every observable source). This module is
 * now a *facade* that derives the canonical metadata objects
 * (`TECHNOLOGY_CATALOG`, `TECHNOLOGY_IDS`, `TECHNOLOGY_CATEGORIES`,
 * `getTechnology`) directly from {@link TECHNOLOGY_DEFINITIONS}.
 *
 * The catalog's `signaturesFor(kind)` accessor feeds the six detectors,
 * whose matching logic is unchanged — they simply read their signatures
 * from the catalog instead of a local literal.
 *
 * ## What the catalog does NOT do
 *
 * - It does NOT change the `Technology` interface or domain model.
 * - It does NOT add a new detection abstraction — `Technology` is a plain
 *   data structure; the catalog is just a collection of instances.
 * - It does NOT alter the `ScoringDetector` ranking
 *   (`confidence DESC, technology.id ASC`) — cross-technology ordering is
 *   normalized, so relocating signatures does not change results.
 *
 * ## Adding a new technology
 *
 * 1. Add a `catalog/technologies/<id>.ts` file exporting a single
 *    `TechnologyDefinition`.
 * 2. Import it into `catalog/index.ts` and append it to
 *    `TECHNOLOGY_DEFINITIONS`.
 * 3. Add a positive fixture to `fixtures/detector-fixtures.ts`.
 *
 * That is it — no detector, scorer, deduplicator, or engine file changes.
 */

import type { Technology } from '@devlens/core';
import { createTechnologyId, createTechnologyCategory } from '@devlens/core';
import { TECHNOLOGY_DEFINITIONS } from './catalog/index.js';

/**
 * A single technology entry in the catalog (public metadata).
 */
export interface CatalogEntry {
  /** The canonical technology ID (matches `TechnologyId` branding). */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** Technology category. */
  readonly category: string;
}

/**
 * The full technology catalog — a record mapping technology ID keys
 * to their canonical `Technology` objects, derived from the declarative
 * `TECHNOLOGY_DEFINITIONS`.
 *
 * Categories in use:
 * - `server` — web servers (nginx, Apache, IIS, Caddy, OpenResty, LiteSpeed, Tomcat)
 * - `language` — server-side languages (PHP)
 * - `framework` — web frameworks (Next.js, React, Vue, Angular, Svelte, ...)
 * - `library` — client-side libraries (jQuery, Lodash, D3, Popper.js, ...)
 * - `cms` — content management systems (WordPress, Hugo, Jekyll, Ghost, TYPO3, ...)
 * - `service_worker` — PWA / service-worker platforms (Firebase)
 * - `ecommerce` — e-commerce platforms (Shopify, WooCommerce, BigCommerce)
 * - `fonts` — font delivery services (Google Fonts)
 * - `analytics` — analytics & marketing tools (Google Analytics, GTM, Matomo, ...)
 * - `cdn` — content delivery networks & edge platforms (Cloudflare, Fastly, Vercel)
 */
export const TECHNOLOGY_CATALOG: Record<string, Technology> = Object.fromEntries(
  TECHNOLOGY_DEFINITIONS.map((def) => [
    def.id,
    {
      id: createTechnologyId(def.id),
      name: def.name,
      category: createTechnologyCategory(def.category),
    },
  ]),
);

/**
 * The set of all technology IDs defined in the catalog.
 */
export const TECHNOLOGY_IDS = new Set(Object.keys(TECHNOLOGY_CATALOG));

/**
 * The set of all categories used by technologies in the catalog.
 */
export const TECHNOLOGY_CATEGORIES = new Set(
  Object.values(TECHNOLOGY_CATALOG).map((t) => t.category),
);

/**
 * Looks up a technology by its catalog key.
 *
 * @throws {Error} if the technology ID is not in the catalog.
 */
export function getTechnology(id: string): Technology {
  const tech = TECHNOLOGY_CATALOG[id];
  if (tech === undefined) {
    throw new Error(`Unknown technology ID: ${id}`);
  }
  return tech;
}
