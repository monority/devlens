/**
 * Technology catalog presentation layer.
 *
 * Pure module — no React, HTTP, or database dependencies. Wraps the
 * existing catalog data from `@devlens/detectors` (`TECHNOLOGY_CATALOG`)
 * and adds presentation-only metadata (descriptions) that do not
 * exist in the catalog and do NOT conflict with detector logic.
 *
 * The catalog in `@devlens/detectors` remains the single source of
 * truth for technology IDs, names, and categories. This module only
 * adds presentation concerns (descriptions) for the web UI.
 */

import { TECHNOLOGY_CATALOG, TECHNOLOGY_IDS } from '@devlens/detectors';

/**
 * A technology entry suitable for the public UI.
 */
export interface TechnologyPresentation {
  /** The canonical technology ID (matches the catalog key and API response). */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** Technology category (e.g. "server", "framework", "cms"). */
  readonly category: string;
  /** Factual, concise description for the catalog/detail pages. */
  readonly description: string;
}

/**
 * Small explicit description map for technologies.
 *
 * These descriptions are presentation-only and based strictly on the
 * technology's known identity and category. They do NOT override or
 * conflict with any detector metadata. Entries not present here fall
 * back to a neutral default.
 */
const TECHNOLOGY_DESCRIPTIONS: Record<string, string> = {
  // Servers
  nginx: 'High-performance web server and reverse proxy',
  apache: 'Open-source web server',
  iis: 'Microsoft web server for Windows Server',

  // Languages
  php: 'Server-side scripting language',

  // CMS
  wordpress: 'Open-source content management system',
  drupal: 'Open-source content management system',
  webflow: 'Visual web design and hosting platform',
  hugo: 'Static site generator written in Go',
  jekyll: 'Static site generator written in Ruby',
  ghost: 'Open-source blogging platform',
  prestashop: 'Open-source e-commerce platform',

  // Frameworks
  express: 'Minimal Node.js web application framework',
  laravel: 'PHP web application framework',
  nextjs: 'React framework for server-rendered web applications',
  nuxtjs: 'Vue.js framework for server-rendered web applications',
  gatsby: 'React-based static site generator',
  react: 'JavaScript library for building user interfaces',
  vue: 'Progressive JavaScript framework',
  angular: 'TypeScript-based web application framework',
  svelte: 'Component compiler for building user interfaces',
  astro: 'Static site builder with partial hydration',
  bootstrap: 'CSS framework for responsive design',

  // Libraries
  jquery: 'JavaScript library for DOM manipulation',
  lodash: 'JavaScript utility library',
  tailwind: 'Utility-first CSS framework',

  // Services
  firebase: 'Backend-as-a-service platform',
  shopify: 'E-commerce platform and storefront solution',
  woocommerce: 'E-commerce plugin for WordPress',
  cloudflare: 'Content delivery network and security platform',
  'google-fonts': 'Free font service by Google',
  'google-analytics': 'Web analytics platform',
  plausible: 'Privacy-focused web analytics',
};

/** Default description for technologies without a custom entry. */
const DEFAULT_DESCRIPTION = 'Detected by DevLens.';

/**
 * Returns a concise factual description for a technology, falling back
 * to a neutral default if no custom description exists.
 *
 * @param id The catalog key for the technology
 * @returns A short description string
 */
export function getTechnologyDescription(id: string): string {
  return TECHNOLOGY_DESCRIPTIONS[id] ?? DEFAULT_DESCRIPTION;
}

/**
 * Looks up a technology by its ID (catalog key).
 *
 * @param id The technology ID (same as the catalog key, e.g. `"react"`)
 * @returns The presentation entry, or `null` if the ID is unknown
 */
export function getTechnologyById(id: string): TechnologyPresentation | null {
  const tech = TECHNOLOGY_CATALOG[id];
  if (tech === undefined) {
    return null;
  }
  return {
    id: tech.id,
    name: tech.name,
    category: tech.category,
    description: getTechnologyDescription(id),
  };
}

/**
 * Returns all catalog technologies as presentation entries.
 *
 * The order follows `Object.keys()` of the catalog record, which is
 * insertion order — deterministic and stable.
 *
 * @returns All technologies, each with id, name, category, and description
 */
export function getTechnologies(): TechnologyPresentation[] {
  return Object.keys(TECHNOLOGY_CATALOG).map((id) => {
    const tech = TECHNOLOGY_CATALOG[id]!;
    return {
      id: tech.id,
      name: tech.name,
      category: tech.category,
      description: getTechnologyDescription(id),
    };
  });
}

/**
 * Checks whether a technology ID exists in the catalog.
 *
 * Safe to use with IDs that come from API responses — if the ID is not
 * in the catalog, the caller should render the technology name as plain
 * text (no catalog link) rather than a broken link.
 *
 * @param id The technology ID to check
 * @returns `true` if the ID exists in the catalog
 */
export function isKnownTechnology(id: string): boolean {
  return TECHNOLOGY_IDS.has(id);
}
