import { describe, it, expect } from 'vitest';
import {
  TECHNOLOGY_CATALOG,
  TECHNOLOGY_IDS,
  TECHNOLOGY_CATEGORIES,
  getTechnology,
} from './technology-catalog.js';
import type { TechnologyId } from '@devlens/core';

// ─── Expected technology inventory ─────────────────────────────────
// This is the exhaustive list of technologies that the system can detect,
// derived from the signature tables of all 6 detectors. It is used to
// verify the catalog completeness and consistency.

const EXPECTED_TECHNOLOGIES: Record<string, { name: string; category: string }> = {
  // HeaderDetector
  nginx: { name: 'nginx', category: 'server' },
  apache: { name: 'Apache', category: 'server' },
  iis: { name: 'IIS', category: 'server' },
  express: { name: 'Express', category: 'framework' },
  php: { name: 'PHP', category: 'language' },
  cloudflare: { name: 'Cloudflare', category: 'cdn' },

  // MetaTagDetector
  wordpress: { name: 'WordPress', category: 'cms' },
  hugo: { name: 'Hugo', category: 'cms' },
  jekyll: { name: 'Jekyll', category: 'cms' },
  ghost: { name: 'Ghost', category: 'cms' },
  prestashop: { name: 'PrestaShop', category: 'cms' },
  nextjs: { name: 'Next.js', category: 'framework' },
  gatsby: { name: 'Gatsby', category: 'framework' },
  nuxtjs: { name: 'Nuxt.js', category: 'framework' },

  // ScriptUrlDetector
  jquery: { name: 'jQuery', category: 'library' },
  bootstrap: { name: 'Bootstrap', category: 'framework' },
  lodash: { name: 'Lodash', category: 'library' },
  woocommerce: { name: 'WooCommerce', category: 'ecommerce' },
  'google-analytics': { name: 'Google Analytics', category: 'analytics' },
  plausible: { name: 'Plausible Analytics', category: 'analytics' },

  // ContentScriptDetector
  react: { name: 'React', category: 'framework' },
  vue: { name: 'Vue.js', category: 'framework' },
  angular: { name: 'Angular', category: 'framework' },
  svelte: { name: 'Svelte', category: 'framework' },
  astro: { name: 'Astro', category: 'framework' },
  drupal: { name: 'Drupal', category: 'cms' },
  laravel: { name: 'Laravel', category: 'framework' },
  webflow: { name: 'Webflow', category: 'cms' },

  // ResourceDetector
  firebase: { name: 'Firebase', category: 'service_worker' },
  tailwind: { name: 'Tailwind CSS', category: 'library' },

  // LinkDetector
  shopify: { name: 'Shopify', category: 'ecommerce' },
  'google-fonts': { name: 'Google Fonts', category: 'fonts' },

  // ── Step 68 declarative additions ──────────────────────────
  // HeaderDetector
  caddy: { name: 'Caddy', category: 'server' },
  openresty: { name: 'OpenResty', category: 'server' },
  litespeed: { name: 'LiteSpeed', category: 'server' },
  tomcat: { name: 'Tomcat', category: 'server' },
  fastly: { name: 'Fastly', category: 'cdn' },
  vercel: { name: 'Vercel', category: 'cdn' },
  // MetaTagDetector
  typo3: { name: 'TYPO3', category: 'cms' },
  joomla: { name: 'Joomla', category: 'cms' },
  'craft-cms': { name: 'Craft CMS', category: 'cms' },
  mediawiki: { name: 'MediaWiki', category: 'cms' },
  // ScriptUrlDetector
  'google-tag-manager': { name: 'Google Tag Manager', category: 'analytics' },
  matomo: { name: 'Matomo', category: 'analytics' },
  segment: { name: 'Segment', category: 'analytics' },
  htmx: { name: 'HTMX', category: 'library' },
  turbo: { name: 'Turbo', category: 'library' },
  stimulus: { name: 'Stimulus', category: 'library' },
  alpinejs: { name: 'Alpine.js', category: 'library' },
  bigcommerce: { name: 'BigCommerce', category: 'ecommerce' },
  d3: { name: 'D3', category: 'library' },
  popperjs: { name: 'Popper.js', category: 'library' },
  // ContentScriptDetector
  ember: { name: 'Ember', category: 'framework' },
  backbone: { name: 'Backbone', category: 'framework' },
};

// ─── Tests ─────────────────────────────────────────────────────────

describe('TechnologyCatalog', () => {
  describe('catalog completeness', () => {
    it('contains all technologies produced by the detectors', () => {
      const actualKeys = new Set(Object.keys(TECHNOLOGY_CATALOG));
      for (const expectedKey of Object.keys(EXPECTED_TECHNOLOGIES)) {
        expect(actualKeys, `technology "${expectedKey}" missing from catalog`).toContain(
          expectedKey,
        );
      }
    });

    it('contains exactly 54 technologies', () => {
      expect(Object.keys(TECHNOLOGY_CATALOG)).toHaveLength(54);
    });

    it('every expected technology is present with correct metadata', () => {
      for (const [id, expected] of Object.entries(EXPECTED_TECHNOLOGIES)) {
        const tech = TECHNOLOGY_CATALOG[id];
        expect(tech, `technology "${id}" not in catalog`).toBeDefined();
        expect(tech!.name).toBe(expected.name);
        expect(tech!.category).toBe(expected.category);
      }
    });
  });

  describe('ID consistency', () => {
    it('all catalog entries have non-empty ids', () => {
      for (const [key, tech] of Object.entries(TECHNOLOGY_CATALOG)) {
        expect(tech.id, `technology "${key}" has empty id`).not.toBe('');
      }
    });

    it('all catalog keys match the technology id value', () => {
      for (const [key, tech] of Object.entries(TECHNOLOGY_CATALOG)) {
        expect(tech.id).toBe(key);
      }
    });

    it('TECHNOLOGY_IDS matches catalog keys', () => {
      expect(TECHNOLOGY_IDS.size).toBe(Object.keys(TECHNOLOGY_CATALOG).length);
      for (const key of Object.keys(TECHNOLOGY_CATALOG)) {
        expect(TECHNOLOGY_IDS.has(key)).toBe(true);
      }
    });
  });

  describe('category consistency', () => {
    it('each technology has a consistent category across the catalog', () => {
      // The catalog is the source of truth — each technology appears once
      // with a single category. This test verifies that by construction.
      const seen = new Set<string>();
      for (const tech of Object.values(TECHNOLOGY_CATALOG)) {
        const key = `${tech.id}->${tech.category}`;
        expect(seen.has(key), `duplicate catalog entry for ${tech.id}`).toBe(false);
        seen.add(key);
      }
    });

    it('TECHNOLOGY_CATEGORIES contains all expected categories', () => {
      const expectedCategories = new Set([
        'server',
        'language',
        'cms',
        'framework',
        'library',
        'service_worker',
        'ecommerce',
        'fonts',
        'analytics',
      ]);
      for (const cat of expectedCategories) {
        expect(TECHNOLOGY_CATEGORIES.has(cat)).toBe(true);
      }
    });
  });

  describe('getTechnology', () => {
    it('returns the technology for a known ID', () => {
      const tech = getTechnology('wordpress');
      expect(tech.id).toBe('wordpress' as TechnologyId);
      expect(tech.name).toBe('WordPress');
      expect(tech.category).toBe('cms');
    });

    it('throws for an unknown ID', () => {
      expect(() => getTechnology('nonexistent')).toThrow('Unknown technology ID: nonexistent');
    });

    it('returns the exact same object reference as the catalog', () => {
      const fromCatalog = TECHNOLOGY_CATALOG['nextjs'];
      const fromGetter = getTechnology('nextjs');
      expect(fromGetter).toBe(fromCatalog);
    });
  });

  describe('cross-technology identity consistency', () => {
    it('Next.js uses the same ID across all detectors (nextjs)', () => {
      // MetaTagDetector, ScriptUrlDetector, ContentScriptDetector all detect Next.js
      // They must all use the same technology ID.
      expect(TECHNOLOGY_CATALOG['nextjs']).toBeDefined();
      expect(TECHNOLOGY_CATALOG['nextjs']!.name).toBe('Next.js');
      expect(TECHNOLOGY_CATALOG['nextjs']!.category).toBe('framework');
    });

    it('WordPress uses the same ID across all detectors (wordpress)', () => {
      // MetaTagDetector, ScriptUrlDetector, ResourceDetector, LinkDetector
      expect(TECHNOLOGY_CATALOG['wordpress']).toBeDefined();
      expect(TECHNOLOGY_CATALOG['wordpress']!.name).toBe('WordPress');
      expect(TECHNOLOGY_CATALOG['wordpress']!.category).toBe('cms');
    });

    it('Nuxt.js uses the same ID across all detectors (nuxtjs)', () => {
      expect(TECHNOLOGY_CATALOG['nuxtjs']).toBeDefined();
      expect(TECHNOLOGY_CATALOG['nuxtjs']!.name).toBe('Nuxt.js');
      expect(TECHNOLOGY_CATALOG['nuxtjs']!.category).toBe('framework');
    });

    it('Gatsby uses the same ID across all detectors (gatsby)', () => {
      expect(TECHNOLOGY_CATALOG['gatsby']).toBeDefined();
      expect(TECHNOLOGY_CATALOG['gatsby']!.name).toBe('Gatsby');
      expect(TECHNOLOGY_CATALOG['gatsby']!.category).toBe('framework');
    });
  });

  describe('all catalog entries are valid Technology objects', () => {
    it('every entry has id, name, and category fields', () => {
      for (const [key, tech] of Object.entries(TECHNOLOGY_CATALOG)) {
        expect(tech, `catalog entry "${key}" is undefined`).toBeDefined();
        expect(typeof tech.id).toBe('string');
        expect(tech.id).not.toBe('');
        expect(typeof tech.name).toBe('string');
        expect(tech.name).not.toBe('');
        expect(typeof tech.category).toBe('string');
        expect(tech.category).not.toBe('');
      }
    });
  });
});
