/**
 * Centralized technology catalog — the single source of truth for
 * technology metadata (id, name, category).
 *
 * ## Purpose
 *
 * Before this module, technology metadata (`id`, `name`, `category`) was
 * duplicated across the signature tables of six detectors:
 * `HeaderDetector`, `MetaTagDetector`, `ScriptUrlDetector`,
 * `ContentScriptDetector`, `ResourceDetector`, and `LinkDetector`.
 * Each signature table repeated `technologyName` and
 * `technologyCategory` alongside `technologyId`, creating a risk of
 * divergence (e.g. WordPress documented as `cms` in one detector and
 * `framework` in another).
 *
 * This catalog centralizes all technology definitions in one place.
 * Detectors reference the catalog by `technologyId` (a plain string key)
 * and retrieve the canonical `Technology` object. This eliminates
 * duplication without adding a new domain concept — it simply uses the
 * existing `Technology` interface from `@devlens/core`.
 *
 * ## What the catalog does NOT do
 *
 * - It does NOT define signatures, conficiencies, or evidence. Those
 *   remain in the individual detector signature tables.
 * - It does NOT change the `Technology` interface or domain model.
 * - It does NOT create a new abstraction — `Technology` is already a
 *   plain data structure; the catalog is just a collection of instances.
 *
 * ## Adding a new technology
 *
 * To add a new technology:
 * 1. Add an entry to `TECHNOLOGY_CATALOG` below.
 * 2. Add the corresponding signature to the appropriate detector's
 *   `SIGNATURES` table (referencing the catalog key).
 * 3. Document the new technology in `docs/architecture/detectors.md`.
 */

import type { Technology } from '@devlens/core';
import { createTechnologyId, createTechnologyCategory } from '@devlens/core';

/**
 * A single technology entry in the catalog.
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
 * to their canonical `Technology` objects.
 *
 * Categories in use:
 * - `server` — web servers (nginx, Apache, IIS)
 * - `language` — server-side languages (PHP)
 * - `framework` — web frameworks (Next.js, React, Vue, etc.)
 * - `library` — client-side libraries (jQuery, Lodash)
 * - `cms` — content management systems (WordPress, Hugo, Jekyll, Ghost)
 * - `service_worker` — PWA/service worker platforms (Firebase)
 * - `ecommerce` — e-commerce platforms (Shopify, WooCommerce)
 * - `fonts` — font delivery services (Google Fonts)
 * - `analytics` — analytics & marketing tools (Google Analytics, Plausible)
 * - `cdn` — content delivery networks & edge platforms (Cloudflare)
 */
export const TECHNOLOGY_CATALOG: Record<string, Technology> = {
  // ── Servers ───────────────────────────────────────────────
  nginx: {
    id: createTechnologyId('nginx'),
    name: 'nginx',
    category: createTechnologyCategory('server'),
  },
  apache: {
    id: createTechnologyId('apache'),
    name: 'Apache',
    category: createTechnologyCategory('server'),
  },
  iis: {
    id: createTechnologyId('iis'),
    name: 'IIS',
    category: createTechnologyCategory('server'),
  },

  // ── Languages ─────────────────────────────────────────────
  php: {
    id: createTechnologyId('php'),
    name: 'PHP',
    category: createTechnologyCategory('language'),
  },

  // ── CMS ───────────────────────────────────────────────────
  wordpress: {
    id: createTechnologyId('wordpress'),
    name: 'WordPress',
    category: createTechnologyCategory('cms'),
  },
  drupal: {
    id: createTechnologyId('drupal'),
    name: 'Drupal',
    category: createTechnologyCategory('cms'),
  },
  webflow: {
    id: createTechnologyId('webflow'),
    name: 'Webflow',
    category: createTechnologyCategory('cms'),
  },
  hugo: {
    id: createTechnologyId('hugo'),
    name: 'Hugo',
    category: createTechnologyCategory('cms'),
  },
  jekyll: {
    id: createTechnologyId('jekyll'),
    name: 'Jekyll',
    category: createTechnologyCategory('cms'),
  },
  ghost: {
    id: createTechnologyId('ghost'),
    name: 'Ghost',
    category: createTechnologyCategory('cms'),
  },
  prestashop: {
    id: createTechnologyId('prestashop'),
    name: 'PrestaShop',
    category: createTechnologyCategory('cms'),
  },

  // ── Frameworks ─────────────────────────────────────────────
  express: {
    id: createTechnologyId('express'),
    name: 'Express',
    category: createTechnologyCategory('framework'),
  },
  laravel: {
    id: createTechnologyId('laravel'),
    name: 'Laravel',
    category: createTechnologyCategory('framework'),
  },
  nextjs: {
    id: createTechnologyId('nextjs'),
    name: 'Next.js',
    category: createTechnologyCategory('framework'),
  },
  nuxtjs: {
    id: createTechnologyId('nuxtjs'),
    name: 'Nuxt.js',
    category: createTechnologyCategory('framework'),
  },
  gatsby: {
    id: createTechnologyId('gatsby'),
    name: 'Gatsby',
    category: createTechnologyCategory('framework'),
  },
  react: {
    id: createTechnologyId('react'),
    name: 'React',
    category: createTechnologyCategory('framework'),
  },
  vue: {
    id: createTechnologyId('vue'),
    name: 'Vue.js',
    category: createTechnologyCategory('framework'),
  },
  angular: {
    id: createTechnologyId('angular'),
    name: 'Angular',
    category: createTechnologyCategory('framework'),
  },
  svelte: {
    id: createTechnologyId('svelte'),
    name: 'Svelte',
    category: createTechnologyCategory('framework'),
  },
  astro: {
    id: createTechnologyId('astro'),
    name: 'Astro',
    category: createTechnologyCategory('framework'),
  },
  bootstrap: {
    id: createTechnologyId('bootstrap'),
    name: 'Bootstrap',
    category: createTechnologyCategory('framework'),
  },

  // ── Libraries ──────────────────────────────────────────────
  jquery: {
    id: createTechnologyId('jquery'),
    name: 'jQuery',
    category: createTechnologyCategory('library'),
  },
  lodash: {
    id: createTechnologyId('lodash'),
    name: 'Lodash',
    category: createTechnologyCategory('library'),
  },
  tailwind: {
    id: createTechnologyId('tailwind'),
    name: 'Tailwind CSS',
    category: createTechnologyCategory('library'),
  },

  // ── Services ───────────────────────────────────────────────
  firebase: {
    id: createTechnologyId('firebase'),
    name: 'Firebase',
    category: createTechnologyCategory('service_worker'),
  },
  shopify: {
    id: createTechnologyId('shopify'),
    name: 'Shopify',
    category: createTechnologyCategory('ecommerce'),
  },
  woocommerce: {
    id: createTechnologyId('woocommerce'),
    name: 'WooCommerce',
    category: createTechnologyCategory('ecommerce'),
  },
  cloudflare: {
    id: createTechnologyId('cloudflare'),
    name: 'Cloudflare',
    category: createTechnologyCategory('cdn'),
  },
  'google-fonts': {
    id: createTechnologyId('google-fonts'),
    name: 'Google Fonts',
    category: createTechnologyCategory('fonts'),
  },
  'google-analytics': {
    id: createTechnologyId('google-analytics'),
    name: 'Google Analytics',
    category: createTechnologyCategory('analytics'),
  },
  plausible: {
    id: createTechnologyId('plausible'),
    name: 'Plausible Analytics',
    category: createTechnologyCategory('analytics'),
  },
} as const;

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
