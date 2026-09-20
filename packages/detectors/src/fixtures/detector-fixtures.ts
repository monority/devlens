/**
 * Detector fixture definitions for the Step 13 golden regression suite.
 *
 * Each fixture is a **realistic** `SiteSnapshot` — not a single magic-string
 * example. Fixtures include multiple observation sources (HTTP headers, meta
 * tags, scripts, links, resources) to exercise the full detector pipeline.
 *
 * Golden expectations are expressed as:
 * - `expected` — technology IDs that MUST be detected
 * - `forbidden` — technology IDs that MUST NOT be detected
 *
 * The test runner (`golden-fixtures.test.ts`) builds the real pipeline
 * (`CompositeDetector → DeduplicatingDetector → ScoringDetector`) and
 * asserts these expectations.
 */

import type {
  SiteSnapshot,
  HttpHeader,
  MetaTag,
  ScriptTag,
  LinkTag,
  Resource,
  ResourceType,
} from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';
import { TECHNOLOGY_IDS } from '../technology-catalog.js';

// ─── Fixture type ─────────────────────────────────────────────────────────

/**
 * A detection fixture: a realistic `SiteSnapshot` plus golden expectations
 * describing which technologies must and must not be detected from it.
 */
export interface Fixture {
  /** Short identifier (technology ID or category name). */
  readonly name: string;
  /** Human-readable description of the scenario. */
  readonly description: string;
  /** Technology category (for sorting / grouping). */
  readonly category: string;
  /** The realistic site snapshot to run through the pipeline. */
  readonly snapshot: SiteSnapshot;
  /** Technology IDs that MUST appear in the detection result. */
  readonly expected: readonly string[];
  /** Technology IDs that MUST NOT appear in the detection result. */
  readonly forbidden: readonly string[];
}

// ─── Snapshot builder ─────────────────────────────────────────────────────

/**
 * Input shape for building a `Resource` with optional defaults.
 * Callers provide `url`, `type`, and `content`; the builder fills
 * in `size`, `httpStatus`, and `contentType` defaults.
 */
interface ResourceInput {
  readonly url: string;
  readonly type: ResourceType;
  readonly content: string;
  readonly size?: number | null;
  readonly httpStatus?: number;
  readonly contentType?: string | null;
}

/**
 * Builds a realistic `SiteSnapshot` from the given observation fragments.
 * All fields default to sensible empty values — callers only specify
 * the observations relevant to their fixture.
 */
function makeSnapshot(parts: {
  headers?: HttpHeader[];
  metaTags?: MetaTag[];
  scripts?: ScriptTag[];
  links?: LinkTag[];
  resources?: ResourceInput[];
}): SiteSnapshot {
  const resources: Resource[] = (parts.resources ?? []).map((r) => ({
    url: createUrl(r.url),
    type: r.type,
    size: r.size ?? null,
    content: r.content,
    httpStatus: r.httpStatus !== undefined ? createHttpStatus(r.httpStatus) : createHttpStatus(200),
    contentType: r.contentType ?? null,
  }));

  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: parts.headers ?? [],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'Example Site',
      description: null,
      metaTags: parts.metaTags ?? [],
      scripts: parts.scripts ?? [],
      links: parts.links ?? [],
    },
    resources,
  };
}

// ─── Catalog of all technology IDs ─────────────────────────────────────────

/**
 * All technology IDs in the catalog, derived (not hand-maintained) so the
 * golden fixture-coverage assertions stay in sync with the catalog. A
 * fixture's `forbidden` list should be a subset of these.
 */
export const ALL_TECH_IDS: readonly string[] = Array.from(TECHNOLOGY_IDS);

// ─── Positive fixtures ─────────────────────────────────────────────────────
// One fixture per catalog technology. Each fixture simulates a realistic
// page that would trigger detection of that technology through one or
// more evidence sources.

export const FIXTURES: readonly Fixture[] = [
  // ── Servers ────────────────────────────────────────────────────────

  {
    name: 'nginx',
    description: 'Server behind nginx (Server header fingerprint)',
    category: 'server',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'nginx/1.21.6 (Ubuntu)' },
        { name: 'content-type', value: 'text/html; charset=utf-8' },
      ],
    }),
    expected: ['nginx'],
    forbidden: ['apache', 'iis'],
  },

  {
    name: 'apache',
    description: 'Server behind Apache HTTPD (Server header fingerprint)',
    category: 'server',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'Apache/2.4.41 (Ubuntu)' },
        { name: 'content-type', value: 'text/html; charset=utf-8' },
      ],
    }),
    expected: ['apache'],
    forbidden: ['nginx', 'iis'],
  },

  {
    name: 'iis',
    description: 'Server behind IIS (Server header fingerprint)',
    category: 'server',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'Microsoft-IIS/10.0' },
        { name: 'X-Powered-By', value: 'ASP.NET' },
      ],
    }),
    expected: ['iis'],
    forbidden: ['nginx', 'apache'],
  },

  // ── Languages ────────────────────────────────────────────────────

  {
    name: 'php',
    description: 'PHP application (X-Powered-By header fingerprint)',
    category: 'language',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'nginx/1.21' },
        { name: 'X-Powered-By', value: 'PHP/8.2.10' },
      ],
      metaTags: [{ name: 'description', content: 'PHP application backend' }],
    }),
    expected: ['php'],
    forbidden: ['laravel', 'drupal', 'wordpress'],
  },

  // ── Frameworks ───────────────────────────────────────────────────

  {
    name: 'express',
    description: 'Express.js API server (X-Powered-By header fingerprint)',
    category: 'framework',
    snapshot: makeSnapshot({
      headers: [
        { name: 'X-Powered-By', value: 'Express' },
        { name: 'Server', value: 'nginx/1.21' },
      ],
    }),
    expected: ['express'],
    forbidden: ['php', 'laravel', 'nextjs'],
  },

  {
    name: 'nextjs',
    description:
      'Next.js + React: generator meta, _next/ script URL, __NEXT_DATA__ inline, react-dom inline',
    category: 'framework',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'vercel' }],
      metaTags: [{ name: 'generator', content: 'Next.js' }],
      scripts: [
        { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
        {
          src: null,
          content: 'window.__NEXT_DATA__ = {"props":{"pageProps":{}},"page":"/"};',
        },
        {
          src: null,
          content: 'import ReactDOM from "react-dom"; import React from "react";',
        },
      ],
      links: [
        {
          rel: 'stylesheet',
          href: 'https://example.com/_next/static/css/styles.css',
          content: '<link rel="stylesheet" href="/_next/static/css/styles.css">',
        },
      ],
    }),
    expected: ['nextjs', 'react', 'vercel'],
    forbidden: ['vue', 'angular', 'svelte', 'astro', 'nuxtjs'],
  },

  {
    name: 'react',
    description: 'React SPA: react-dom inline, createRoot inline, no Next.js traces',
    category: 'framework',
    snapshot: makeSnapshot({
      scripts: [
        {
          src: null,
          content:
            'import ReactDOM from "react-dom/client"; const root = ReactDOM.createRoot(document.getElementById("root")); root.render(<App/>);',
        },
      ],
    }),
    expected: ['react'],
    forbidden: ['nextjs', 'vue', 'angular'],
  },

  {
    name: 'vue',
    description: 'Vue 3 app: Vue.createApp inline, no Nuxt traces',
    category: 'framework',
    snapshot: makeSnapshot({
      scripts: [
        {
          src: null,
          content:
            'const app = Vue.createApp({ data() { return { msg: "Hello" } } }); app.mount("#app");',
        },
      ],
      links: [],
    }),
    expected: ['vue'],
    forbidden: ['nextjs', 'nuxtjs', 'react', 'angular'],
  },

  {
    name: 'angular',
    description: 'Angular app: @angular/core inline, platformBrowserDynamic inline',
    category: 'framework',
    snapshot: makeSnapshot({
      scripts: [
        {
          src: null,
          content:
            'import { platformBrowserDynamic } from "@angular/platform-browser-dynamic"; platformBrowserDynamic.bootstrapModule(AppModule);',
        },
        { src: null, content: 'import { Component } from "@angular/core";' },
      ],
    }),
    expected: ['angular'],
    forbidden: ['react', 'vue', 'svelte', 'nextjs'],
  },

  {
    name: 'svelte',
    description: 'Svelte app with __SVELTE__ global',
    category: 'framework',
    snapshot: makeSnapshot({
      scripts: [
        {
          src: null,
          content:
            'window.__SVELTE__ = { version: "4.2" }; import { SvelteComponent } from "svelte";',
        },
      ],
    }),
    expected: ['svelte'],
    forbidden: ['react', 'vue', 'angular', 'astro'],
  },

  {
    name: 'astro',
    description: 'Astro site with astro-island web component',
    category: 'framework',
    snapshot: makeSnapshot({
      scripts: [
        {
          src: null,
          content:
            'class AstroIsland extends HTMLElement { connectedCallback() { this.innerHTML = "<astro-island />"; } }',
        },
        { src: null, content: 'customElements.define("astro-island", AstroIsland);' },
      ],
    }),
    expected: ['astro'],
    forbidden: ['svelte', 'nextjs', 'nuxtjs'],
  },

  {
    name: 'nuxtjs',
    description: 'Nuxt.js site: /_nuxt/ script URL + Vue.createApp inline (coexistence)',
    category: 'framework',
    snapshot: makeSnapshot({
      metaTags: [{ name: 'generator', content: 'Nuxt.js 3.8' }],
      scripts: [
        { src: 'https://example.com/_nuxt/entry-abc123.js', content: '' },
        {
          src: null,
          content: 'const app = Vue.createApp(nuxtApp); app.mount("#__nuxt");',
        },
      ],
    }),
    expected: ['nuxtjs', 'vue'],
    forbidden: ['nextjs', 'react', 'svelte'],
  },

  {
    name: 'gatsby',
    description: 'Gatsby site: generator meta + gatsby script URL',
    category: 'framework',
    snapshot: makeSnapshot({
      metaTags: [{ name: 'generator', content: 'Gatsby 5.0' }],
      scripts: [
        { src: 'https://example.com/gatsby-static/entry.js', content: '' },
        { src: 'https://example.com/_gatsby/app-9e8f7d6c.js', content: '' },
      ],
    }),
    expected: ['gatsby'],
    forbidden: ['nextjs', 'nuxtjs', 'hugo', 'jekyll'],
  },

  {
    name: 'laravel',
    description: 'Laravel app: X-Powered-By PHP + window.Laravel inline script coexistence',
    category: 'framework',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'nginx/1.21' },
        { name: 'X-Powered-By', value: 'PHP/8.2' },
      ],
      scripts: [
        {
          src: null,
          content:
            'window.Laravel = {"csrfToken": "abc123", "assetPath": "/assets", "locale": "en"};',
        },
      ],
    }),
    expected: ['laravel', 'php'],
    forbidden: ['drupal', 'wordpress', 'nextjs'],
  },

  // ── CMS ───────────────────────────────────────────────────────────

  {
    name: 'wordpress',
    description:
      'WordPress site with generator meta, wp-content scripts, robots.txt, and block-editor CSS',
    category: 'cms',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'nginx/1.21' },
        { name: 'X-Powered-By', value: 'PHP/8.2' },
      ],
      metaTags: [
        { name: 'generator', content: 'WordPress 6.4.2' },
        { name: 'description', content: 'A WordPress blog' },
      ],
      scripts: [
        {
          src: 'https://example.com/wp-content/themes/twentytwentytwo/script.js',
          content: '',
        },
        {
          src: 'https://example.com/wp-includes/js/jquery/jquery.min.js',
          content: '',
        },
      ],
      links: [
        {
          rel: 'stylesheet',
          href: '/wp-content/themes/twentytwentytwo/style.css',
          content: '<link rel="stylesheet" href="/wp-content/themes/twentytwentytwo/style.css">',
        },
      ],
      resources: [
        {
          url: 'https://example.com/robots.txt',
          type: 'robots',
          content:
            'User-agent: *\nDisallow: /wp-admin/\nDisallow: /wp-includes/\nAllow: /wp-content/uploads/',
        },
        {
          url: 'https://example.com/wp-content/themes/twentytwentytwo/style.css',
          type: 'css',
          content:
            '/* Default style */\n:root {\n  --wp--preset--color-primary: #000;\n}\n.wp-block-group { display: block; }',
        },
      ],
    }),
    expected: ['wordpress'],
    forbidden: ['drupal', 'shopify', 'laravel'],
  },

  {
    name: 'drupal',
    description: 'Drupal site with drupalSettings inline script and generator meta',
    category: 'cms',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'nginx/1.21' }],
      metaTags: [{ name: 'generator', content: 'Drupal 10.2.0' }],
      scripts: [
        {
          src: null,
          content:
            'window.drupalSettings = {"basePath": "/", "scriptPath": "/core/scripts}", "path":{"baseUrl":"https://example.com","basePath":"/"}};',
        },
      ],
      links: [],
    }),
    expected: ['drupal'],
    forbidden: ['wordpress', 'laravel', 'nextjs'],
  },

  {
    name: 'webflow',
    description: 'Webflow-published site with Webflow JS runtime',
    category: 'cms',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'cloudflare' }],
      scripts: [
        {
          src: null,
          content:
            'Webflow.require("nav").init(); Webflow.push(function() { Webflow.openLightbox(); });',
        },
      ],
      links: [],
    }),
    expected: ['webflow'],
    forbidden: ['drupal', 'wordpress', 'laravel'],
  },

  {
    name: 'hugo',
    description: 'Hugo static site with generator meta tag',
    category: 'cms',
    snapshot: makeSnapshot({
      metaTags: [{ name: 'generator', content: 'Hugo 0.120.0' }],
      scripts: [],
      links: [],
    }),
    expected: ['hugo'],
    forbidden: ['jekyll', 'ghost', 'wordpress'],
  },

  {
    name: 'jekyll',
    description: 'Jekyll static site with generator meta tag',
    category: 'cms',
    snapshot: makeSnapshot({
      metaTags: [{ name: 'generator', content: 'Jekyll v4.3.2' }],
      scripts: [],
      links: [],
    }),
    expected: ['jekyll'],
    forbidden: ['hugo', 'ghost', 'wordpress'],
  },

  {
    name: 'ghost',
    description: 'Ghost blog with generator meta tag',
    category: 'cms',
    snapshot: makeSnapshot({
      metaTags: [{ name: 'generator', content: 'Ghost 5.0' }],
      scripts: [],
      links: [],
    }),
    expected: ['ghost'],
    forbidden: ['hugo', 'jekyll', 'wordpress'],
  },

  // ── Libraries ─────────────────────────────────────────────────────

  {
    name: 'jquery',
    description: 'jQuery loaded from a CDN',
    category: 'library',
    snapshot: makeSnapshot({
      scripts: [{ src: 'https://code.jquery.com/jquery-3.7.1.min.js', content: '' }],
    }),
    expected: ['jquery'],
    forbidden: ['lodash', 'bootstrap', 'react'],
  },

  {
    name: 'lodash',
    description: 'Lodash loaded as a module',
    category: 'library',
    snapshot: makeSnapshot({
      scripts: [{ src: 'https://example.com/assets/lodash.min.js', content: '' }],
    }),
    expected: ['lodash'],
    forbidden: ['jquery', 'bootstrap', 'react'],
  },

  // ── CSS Library ───────────────────────────────────────────────────

  {
    name: 'tailwind',
    description: 'Tailwind CSS: stylesheet link + CSS resource with @tailwind directives',
    category: 'library',
    snapshot: makeSnapshot({
      links: [
        {
          rel: 'stylesheet',
          href: '/tailwind.css',
          content: '<link rel="stylesheet" href="/tailwind.css">',
        },
      ],
      resources: [
        {
          url: 'https://example.com/tailwind.css',
          type: 'css',
          content:
            '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n@tailwind screens;',
        },
      ],
    }),
    expected: ['tailwind'],
    forbidden: ['bootstrap', 'jekyll', 'hugo'],
  },

  // ── E-commerce ───────────────────────────────────────────────────

  {
    name: 'shopify',
    description: 'Shopify store: stylesheet from cdn.shopify.com',
    category: 'ecommerce',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'cloudflare' }],
      links: [
        {
          rel: 'stylesheet',
          href: 'https://cdn.shopify.com/s/files/1/theme.css',
          content: '<link rel="stylesheet" href="https://cdn.shopify.com/s/files/1/theme.css">',
        },
      ],
    }),
    expected: ['shopify'],
    forbidden: ['wordpress', 'woocommerce', 'webflow'],
  },

  {
    name: 'woocommerce',
    description:
      'WooCommerce + WordPress: generator meta, wp-content scripts, woocommerce plugin script',
    category: 'ecommerce',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'nginx/1.21' },
        { name: 'X-Powered-By', value: 'PHP/8.2' },
      ],
      metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
      scripts: [
        {
          src: 'https://example.com/wp-content/themes/storefront/script.js',
          content: '',
        },
        {
          src: 'https://example.com/wp-content/plugins/woocommerce/assets/js/cart.min.js',
          content: '',
        },
      ],
      resources: [
        {
          url: 'https://example.com/robots.txt',
          type: 'robots',
          content: 'Disallow: /wp-admin/Allow: /wp-content/uploads/',
        },
      ],
    }),
    expected: ['woocommerce', 'wordpress'],
    forbidden: ['shopify', 'drupal', 'laravel'],
  },

  // ── Fonts ────────────────────────────────────────────────────────

  {
    name: 'google-fonts',
    description: 'Google Fonts stylesheet link',
    category: 'fonts',
    snapshot: makeSnapshot({
      links: [
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css?family=Roboto:wght@400;700&display=swap',
          content: '<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto">',
        },
      ],
    }),
    expected: ['google-fonts'],
    forbidden: ['google-analytics', 'shopify', 'bootstrap'],
  },

  // ── Analytics ───────────────────────────────────────────────────

  {
    name: 'google-analytics',
    description: 'Google Analytics via analytics.js script URL',
    category: 'analytics',
    snapshot: makeSnapshot({
      scripts: [
        { src: 'https://www.google-analytics.com/analytics.js', content: '' },
        { src: 'https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID', content: '' },
      ],
    }),
    expected: ['google-analytics', 'google-tag-manager'],
    forbidden: ['google-fonts', 'firebase', 'shopify'],
  },

  // ── Service Worker ───────────────────────────────────────────────

  {
    name: 'firebase',
    description: 'Firebase PWA: manifest with gcm_sender_id',
    category: 'service_worker',
    snapshot: makeSnapshot({
      links: [
        {
          rel: 'manifest',
          href: '/manifest.json',
          content: '<link rel="manifest" href="/manifest.json">',
        },
      ],
      resources: [
        {
          url: 'https://example.com/manifest.json',
          type: 'manifest',
          content:
            '{"name":"MyApp","gcm_sender_id":"1234567890","start_url":"/","display":"standalone"}',
        },
      ],
    }),
    expected: ['firebase'],
    forbidden: ['google-analytics', 'shopify', 'wordpress'],
  },

  // ── Bootstrap ────────────────────────────────────────────────────

  {
    name: 'bootstrap',
    description: 'Bootstrap JS bundle loaded from CDN',
    category: 'framework',
    snapshot: makeSnapshot({
      scripts: [
        {
          src: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
          content: '',
        },
      ],
    }),
    expected: ['bootstrap'],
    forbidden: ['tailwind', 'lodash', 'jquery'],
  },

  // ── CDN ─────────────────────────────────────────────────────

  {
    name: 'cloudflare',
    description: 'Site behind Cloudflare reverse proxy (Server: cloudflare header)',
    category: 'cdn',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'cloudflare' },
        { name: 'CF-RAY', value: '87c56b50ab8a1bce-iad' },
        { name: 'content-type', value: 'text/html; charset=utf-8' },
      ],
    }),
    expected: ['cloudflare'],
    forbidden: ['nginx', 'apache', 'iis'],
  },

  // ── CMS ─────────────────────────────────────────────────────

  {
    name: 'prestashop',
    description: 'PrestaShop e-commerce site identified via generator meta tag',
    category: 'cms',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'nginx/1.21' },
        { name: 'X-Powered-By', value: 'PHP/8.2' },
      ],
      metaTags: [{ name: 'generator', content: 'PrestaShop 1.7.8.10' }],
    }),
    expected: ['prestashop'],
    forbidden: ['wordpress', 'drupal', 'hugo', 'jekyll', 'ghost', 'laravel'],
  },

  // ── Analytics ───────────────────────────────────────────────

  {
    name: 'plausible',
    description: 'Plausible Analytics via script URL containing plausible.io',
    category: 'analytics',
    snapshot: makeSnapshot({
      scripts: [
        { src: 'https://plausible.io/js/script.js', content: '' },
        { src: 'https://plausible.io/js/script.local.js', content: '' },
      ],
    }),
    expected: ['plausible'],
    forbidden: ['google-analytics', 'shopify', 'bootstrap'],
  },

  // ── Coexistence fixtures ──────────────────────────────────────────
  // These verify that legitimately co-occurring technologies are
  // detected independently (not merged or suppressed).

  {
    name: 'nextjs-react-coexist',
    description: 'Next.js + React: __NEXT_DATA__ + react-dom present together',
    category: 'coexistence',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'vercel' }],
      metaTags: [{ name: 'generator', content: 'Next.js' }],
      scripts: [
        { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
        {
          src: null,
          content: 'window.__NEXT_DATA__ = {"props":{}}; react-dom/server',
        },
        {
          src: null,
          content: 'import ReactDOM from "react-dom/client"; ReactDOM.createRoot(el);',
        },
      ],
    }),
    expected: ['nextjs', 'react', 'vercel'],
    forbidden: ['vue', 'angular', 'svelte'],
  },

  {
    name: 'wordpress-woocommerce-coexist',
    description: 'WordPress + WooCommerce: all fingerprints present simultaneously',
    category: 'coexistence',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'nginx/1.21' },
        { name: 'X-Powered-By', value: 'PHP/8.2' },
      ],
      metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
      scripts: [
        { src: 'https://example.com/wp-includes/js/jquery/jquery.min.js', content: '' },
        {
          src: 'https://example.com/wp-content/plugins/woocommerce/assets/js/cart.min.js',
          content: '',
        },
      ],
      links: [
        {
          rel: 'stylesheet',
          href: 'https://example.com/wp-content/plugins/woocommerce/assets/css/cart.css',
          content: '<link>',
        },
      ],
      resources: [
        {
          url: 'https://example.com/robots.txt',
          type: 'robots',
          content: 'Disallow: /wp-admin/Allow: /wp-content/uploads/',
        },
        {
          url: 'https://example.com/wp-content/themes/storefront/style.css',
          type: 'css',
          content: '--wp--preset--color-primary: #000; .woocommerce { }',
        },
      ],
    }),
    expected: ['wordpress', 'woocommerce'],
    forbidden: ['shopify', 'drupal', 'laravel', 'hugo'],
  },

  // ── Negative fixtures ─────────────────────────────────────────────
  // Pages with genuine fingerprints absent — must produce zero detections.

  {
    name: 'no-fingerprint',
    description:
      'Generic website with headers, meta, scripts, links — no known technology fingerprints',
    category: 'negative',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'unknown-server/1.0' },
        { name: 'X-Powered-By', value: 'unknown' },
      ],
      metaTags: [
        { name: 'description', content: 'A portfolio website' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      scripts: [
        { src: '/assets/bundle.js', content: '' },
        { src: null, content: 'console.log("hello world");' },
      ],
      links: [
        { rel: 'stylesheet', href: '/styles/main.css', content: '<link>' },
        { rel: 'icon', href: '/favicon.ico', content: '<link>' },
      ],
    }),
    expected: [],
    forbidden: [...ALL_TECH_IDS],
  },

  {
    name: 'noise',
    description:
      'Page with generic signals that should NOT trigger any detection — false-positive prevention',
    category: 'negative',
    snapshot: makeSnapshot({
      scripts: [
        // "vue" as a variable name — NOT "Vue.createApp"
        { src: null, content: 'const vue = ref(0); const react = true; const next = undefined;' },
        // Generic comment — must NOT contain react-dom, next/router, etc.
        { src: null, content: '// DOM manipulation library\nconst init = true;' },
      ],
      links: [
        // Generic CDN URL — NOT cdn.shopify.com
        {
          rel: 'stylesheet',
          href: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
          content: '<link>',
        },
        // Path containing "wordpress" as a segment — must NOT match (path_segment match)
        {
          rel: 'stylesheet',
          href: 'https://example.com/assets/old-wordpress-theme.css',
          content: '<link>',
        },
      ],
      resources: [
        {
          url: 'https://example.com/styles.css',
          type: 'css',
          content: '/* tailwindcss */\nbody { margin: 0; } .container { display: flex; }',
        },
      ],
    }),
    expected: [],
    forbidden: [...ALL_TECH_IDS],
  },

  // ── False-positive edge cases ────────────────────────────────────
  // These test precision for specific detection boundaries.

  {
    name: 'false-positive-shopify-subdomain',
    description:
      'shopifycdn.com as a subdomain of another domain — must NOT match Shopify (exact hostname match)',
    category: 'negative',
    snapshot: makeSnapshot({
      links: [
        {
          rel: 'stylesheet',
          href: 'https://shopifycdn.com.example.com/files/theme.css',
          content: '<link>',
        },
      ],
    }),
    expected: [],
    forbidden: ['shopify', 'wordpress', 'woocommerce'],
  },

  {
    name: 'false-positive-next-substring',
    description:
      "Script URL containing 'next' but NOT '_next/' — must NOT match Next.js (ScriptUrlDetector requires _next/ prefix)",
    category: 'negative',
    snapshot: makeSnapshot({
      scripts: [{ src: 'https://example.com/assets/next-navigation.js', content: '' }],
    }),
    expected: [],
    forbidden: ['nextjs', 'nuxtjs', 'gatsby', 'hugo', 'jekyll'],
  },

  {
    name: 'false-positive-plausible-substring',
    description:
      "Script URL containing 'plausible' but NOT 'plausible.io' — must NOT match Plausible Analytics",
    category: 'negative',
    snapshot: makeSnapshot({
      scripts: [{ src: 'https://example.com/js/plausible-analytics.js', content: '' }],
    }),
    expected: [],
    forbidden: ['plausible', 'google-analytics'],
  },

  {
    name: 'false-positive-cloudflare-x-powered-by',
    description:
      "X-Powered-By header containing 'cloudflare' — must NOT match Cloudflare (signature is on Server header only)",
    category: 'negative',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'unknown-server/1.0' },
        { name: 'X-Powered-By', value: 'cloudflare-protection' },
      ],
    }),
    expected: [],
    forbidden: ['cloudflare', 'apache', 'iis', 'nginx', 'php', 'express'],
  },

  // ── Adversarial false-positive fixtures ─────────────────────
  // These test specific false-positive scenarios for signatures
  // identified as MEDIUM/HIGH risk in the Step 20 audit.

  {
    name: 'adv-createRoot-vanilla',
    description:
      'Vanilla JS createRoot() without React indicators — must NOT detect React (createRoot is a generic DOM API call)',
    category: 'negative',
    snapshot: makeSnapshot({
      scripts: [
        {
          src: null,
          content: 'const root = createRoot(document.getElementById("app")); root.render(null);',
        },
      ],
    }),
    expected: [],
    forbidden: ALL_TECH_IDS,
  },

  {
    name: 'adv-bootstrap-icons',
    description:
      'bootstrap-icons script URL (a separate package) — must NOT detect Bootstrap framework',
    category: 'negative',
    snapshot: makeSnapshot({
      scripts: [
        {
          src: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.min.js',
          content: '',
        },
      ],
    }),
    expected: [],
    forbidden: ALL_TECH_IDS,
  },

  // ── Adversarial multi-technology coexistence ──────────────
  // Realistic pages that legitimately co-occur — all must be
  // detected independently with correct evidence.

  {
    name: 'adv-cms-analytics-coexist',
    description: 'WordPress site with Plausible Analytics — both must be detected independently',
    category: 'coexistence',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'nginx/1.21' },
        { name: 'X-Powered-By', value: 'PHP/8.2' },
      ],
      metaTags: [{ name: 'generator', content: 'WordPress 6.4.2' }],
      scripts: [
        { src: 'https://plausible.io/js/script.js', content: '' },
        { src: 'https://example.com/wp-includes/js/jquery/jquery.min.js', content: '' },
      ],
    }),
    expected: ['wordpress', 'plausible'],
    forbidden: ['drupal', 'hugo', 'jekyll', 'ghost', 'shopify'],
  },

  {
    name: 'adv-cms-cdn-coexist',
    description: 'WordPress site behind Cloudflare — both must be detected independently',
    category: 'coexistence',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'cloudflare' }],
      metaTags: [{ name: 'generator', content: 'WordPress 6.4.2' }],
      scripts: [{ src: 'https://example.com/wp-content/themes/storefront/style.js', content: '' }],
    }),
    expected: ['wordpress', 'cloudflare'],
    forbidden: ['shopify', 'drupal', 'laravel', 'hugo'],
  },

  {
    name: 'adv-framework-analytics-coexist',
    description: 'React SPA using Plausible Analytics — both must be detected independently',
    category: 'coexistence',
    snapshot: makeSnapshot({
      scripts: [
        { src: 'https://example.com/static/js/main.chunk.js', content: '' },
        {
          src: null,
          content: 'import ReactDOM from "react-dom/client"; const root = ReactDOM.createRoot(el);',
        },
        { src: 'https://plausible.io/js/script.js', content: '' },
      ],
    }),
    expected: ['react', 'plausible'],
    forbidden: ['nextjs', 'vue', 'angular', 'svelte', 'google-analytics'],
  },

  {
    name: 'adv-ecommerce-analytics-coexist',
    description: 'WooCommerce store with Google Analytics — both must be detected independently',
    category: 'coexistence',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'nginx/1.21' },
        { name: 'X-Powered-By', value: 'PHP/8.2' },
      ],
      metaTags: [{ name: 'generator', content: 'WordPress 6.4.2' }],
      scripts: [
        {
          src: 'https://example.com/wp-content/plugins/woocommerce/assets/js/cart.min.js',
          content: '',
        },
        { src: 'https://www.google-analytics.com/analytics.js', content: '' },
      ],
      resources: [
        {
          url: 'https://example.com/robots.txt',
          type: 'robots',
          content: 'Disallow: /wp-admin/',
        },
      ],
    }),
    expected: ['wordpress', 'woocommerce', 'google-analytics'],
    forbidden: ['drupal', 'shopify', 'laravel', 'hugo'],
  },

  {
    name: 'adv-framework-cdn-coexist',
    description: 'Next.js app served via Cloudflare — both must be detected independently',
    category: 'coexistence',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'cloudflare' },
        { name: 'X-Powered-By', value: 'Express' },
      ],
      metaTags: [{ name: 'generator', content: 'Next.js' }],
      scripts: [{ src: 'https://example.com/_next/static/chunks/main.js', content: '' }],
    }),
    expected: ['nextjs', 'express', 'cloudflare'],
    forbidden: ['nuxtjs', 'gatsby', 'vercel'],
  },

  // ── Adversarial case normalization ─────────────────────────
  // Test that case-insensitive matching works for each detector.

  {
    name: 'adv-case-headers',
    description:
      'Case-normalized Server header values — must detect cloudflare, nginx, php, express despite casing',
    category: 'adversarial',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'ClOuDfLaRe' },
        { name: 'X-Powered-By', value: 'pHp/8.2' },
      ],
    }),
    expected: ['cloudflare', 'php'],
    forbidden: ['nginx', 'apache', 'iis', 'express', 'laravel'],
  },

  {
    name: 'adv-case-meta-tags',
    description:
      'Case-normalized meta generator content — must detect WordPress, PrestaShop regardless of casing',
    category: 'adversarial',
    snapshot: makeSnapshot({
      metaTags: [
        { name: 'GENERATOR', content: 'WordPress 6.4' },
        { name: 'generator', content: 'PRESTASHOP 1.7' },
      ],
    }),
    expected: ['wordpress', 'prestashop'],
    forbidden: ['drupal', 'hugo', 'jekyll', 'ghost', 'nextjs', 'gatsby', 'nuxtjs'],
  },

  {
    name: 'adv-case-script-urls',
    description: 'Case-normalized script URLs — must detect technologies despite mixed-case URLs',
    category: 'adversarial',
    snapshot: makeSnapshot({
      scripts: [
        { src: 'https://PlAuSiBlE.Io/js/scRiPt.js', content: '' },
        { src: 'https://example.com/WP-Content/themes/style.js', content: '' },
      ],
    }),
    expected: ['plausible', 'wordpress'],
    forbidden: ['shopify', 'drupal', 'laravel', 'hugo'],
  },

  {
    name: 'adv-case-script-content',
    description: 'Case-normalized inline script content — must detect Vue despite mixed casing',
    category: 'adversarial',
    snapshot: makeSnapshot({
      scripts: [{ src: null, content: 'const app = vUe.cReAtEApp({ data() { return {} } });' }],
    }),
    expected: ['vue'],
    forbidden: ['react', 'angular', 'svelte', 'astro', 'nextjs'],
  },

  // ── Adversarial URL variations ─────────────────────────────
  // Test that URL signatures handle query strings, trailing
  // slashes, and path variations correctly.

  {
    name: 'adv-url-variations',
    description:
      'Script URLs with query strings, trailing slashes, versions — must still detect google-analytics and woocommerce',
    category: 'adversarial',
    snapshot: makeSnapshot({
      scripts: [
        { src: 'https://www.google-analytics.com/analytics.js?v=2&utm_source=test', content: '' },
        {
          src: 'https://example.com/wp-content/plugins/woocommerce/assets/js/cart.min.js?ver=123#fragment',
          content: '',
        },
      ],
    }),
    expected: ['google-analytics', 'woocommerce', 'wordpress'],
    forbidden: ['plausible', 'shopify', 'drupal'],
  },

  // ── Adversarial near-hostname ──────────────────────────────
  // Test that hostname-based signatures do not match lookalike
  // domains (substring vs exact hostname match).

  {
    name: 'adv-near-hostname-google-fonts',
    description:
      'Near-hostname for Google Fonts (fonts.googleapisi.com) — must NOT detect Google Fonts',
    category: 'negative',
    snapshot: makeSnapshot({
      links: [
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapisi.com/css2?family=Roboto',
          content: '<link>',
        },
      ],
    }),
    expected: [],
    forbidden: ['google-fonts', 'shopify', 'wordpress'],
  },

  // ── Adversarial partial observation ────────────────────────
  // Test that detectors tolerate snapshots with only one
  // observation source — no crash, no invented evidence.

  {
    name: 'adv-partial-headers-only',
    description:
      'Snapshot with only HTTP headers — must detect nginx, not crash, not invent other detections',
    category: 'adversarial',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'nginx/1.21.6 (Ubuntu)' }],
      metaTags: [],
      scripts: [],
      links: [],
      resources: [],
    }),
    expected: ['nginx'],
    forbidden: ['php', 'express', 'cloudflare', 'wordpress', 'react', 'vue'],
  },

  {
    name: 'adv-partial-scripts-only',
    description: 'Snapshot with only inline scripts — must detect React from react-dom, not crash',
    category: 'adversarial',
    snapshot: makeSnapshot({
      headers: [],
      metaTags: [],
      scripts: [
        {
          src: null,
          content: 'import ReactDOM from "react-dom/client"; ReactDOM.createRoot(el);',
        },
      ],
      links: [],
      resources: [],
    }),
    expected: ['react'],
    forbidden: ['nextjs', 'vue', 'angular', 'svelte', 'astro'],
  },

  {
    name: 'adv-partial-resources-only',
    description: 'Snapshot with only resources — must detect Tailwind from CSS, not crash',
    category: 'adversarial',
    snapshot: makeSnapshot({
      headers: [],
      metaTags: [],
      scripts: [],
      links: [],
      resources: [
        {
          url: 'https://example.com/styles.css',
          type: 'css',
          content: '@tailwind base; @tailwind components; @tailwind utilities;',
        },
      ],
    }),
    expected: ['tailwind'],
    forbidden: ['wordpress', 'firebase', 'bootstrap'],
  },

  {
    name: 'adv-partial-minimal-html',
    description:
      'Minimal HTML snapshot with no meaningful observations — must produce zero detections',
    category: 'negative',
    snapshot: makeSnapshot({
      headers: [{ name: 'content-type', value: 'text/html' }],
      metaTags: [{ name: 'description', content: 'A simple page' }],
      scripts: [{ src: '/app.js', content: 'console.log(true);' }],
      links: [{ rel: 'icon', href: '/favicon.ico', content: '<link>' }],
      resources: [],
    }),
    expected: [],
    forbidden: ALL_TECH_IDS,
  },

  // ── Adversarial duplicate evidence ─────────────────────────
  // Same technology detected from multiple independent signals
  // must produce exactly one detection with merged evidence.

  {
    name: 'adv-duplicate-evidence-wordpress',
    description:
      'WordPress detected from meta generator + script URL + CSS + robots.txt — must produce ONE detection',
    category: 'adversarial',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'nginx/1.21' },
        { name: 'X-Powered-By', value: 'PHP/8.2' },
      ],
      metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
      scripts: [
        { src: 'https://example.com/wp-content/plugins/akismet/akismet.js', content: '' },
        { src: 'https://example.com/wp-includes/js/jquery/jquery.min.js', content: '' },
      ],
      resources: [
        {
          url: 'https://example.com/robots.txt',
          type: 'robots',
          content: 'Disallow: /wp-admin/ Allow: /wp-content/uploads/',
        },
        {
          url: 'https://example.com/style.css',
          type: 'css',
          content: '--wp--preset--color-primary: #000; .wp-block-group { }',
        },
      ],
    }),
    expected: ['wordpress', 'nginx', 'php'],
    forbidden: ['shopify', 'drupal', 'laravel', 'hugo'],
  },

  {
    name: 'adv-duplicate-evidence-nextjs',
    description:
      'Next.js detected from meta generator + _next/ script + __NEXT_DATA__ inline — must produce ONE detection',
    category: 'adversarial',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'vercel' }],
      metaTags: [{ name: 'generator', content: 'Next.js' }],
      scripts: [
        { src: 'https://example.com/_next/static/chunks/main-abc123.js', content: '' },
        {
          src: null,
          content: 'window.__NEXT_DATA__ = {"props":{}}; import ReactDOM from "react-dom";',
        },
      ],
    }),
    expected: ['nextjs', 'react', 'vercel'],
    forbidden: ['nuxtjs', 'gatsby', 'vue', 'angular'],
  },

  // ── Adversarial trailing-slash path segment ────────────────
  // Path-segment matching must work with trailing slashes and
  // path components in various positions.

  {
    name: 'adv-path-segment-trailing-slash',
    description:
      'Link href with wp-content as exact segment among multiple path components — must detect WordPress',
    category: 'adversarial',
    snapshot: makeSnapshot({
      links: [
        {
          rel: 'stylesheet',
          href: '/wp-content/themes/twentytwentythree/style.css?v=1.0',
          content: '<link>',
        },
      ],
    }),
    expected: ['wordpress'],
    forbidden: ['shopify', 'drupal', 'laravel'],
  },

  // ── Step 68: new declarative technologies (one positive fixture each) ──

  {
    name: 'caddy',
    description: 'Caddy server (Server header fingerprint + version)',
    category: 'server',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'Caddy/v2.8.4 (Fedora)' }],
    }),
    expected: ['caddy'],
    forbidden: ['apache', 'nginx', 'iis', 'openresty', 'litespeed', 'tomcat', 'cloudflare'],
  },

  {
    name: 'openresty',
    description: 'OpenResty (Server header fingerprint + version)',
    category: 'server',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'openresty/1.15.8.22' }],
    }),
    expected: ['openresty'],
    forbidden: ['nginx', 'apache', 'iis', 'caddy', 'litespeed', 'tomcat', 'cloudflare'],
  },

  {
    name: 'litespeed',
    description: 'LiteSpeed (Server header fingerprint)',
    category: 'server',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'LiteSpeed' }],
    }),
    expected: ['litespeed'],
    forbidden: ['nginx', 'apache', 'iis', 'caddy', 'openresty', 'tomcat', 'cloudflare'],
  },

  {
    name: 'tomcat',
    description: 'Apache Tomcat (Server Apache-Coyote fingerprint + version; co-detects Apache)',
    category: 'server',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'Apache-Coyote/1.45' }],
    }),
    expected: ['apache', 'tomcat'],
    forbidden: ['nginx', 'iis', 'caddy', 'openresty', 'litespeed', 'cloudflare', 'express'],
  },

  {
    name: 'fastly',
    description: 'Fastly CDN (Via header fingerprint)',
    category: 'cdn',
    snapshot: makeSnapshot({
      headers: [{ name: 'Via', value: '1.1 varnish, 1.1 fastly-T' }],
    }),
    expected: ['fastly'],
    forbidden: ['cloudflare', 'nginx', 'apache', 'caddy', 'openresty', 'litespeed', 'tomcat'],
  },

  {
    name: 'vercel',
    description: 'Vercel (Server header fingerprint)',
    category: 'cdn',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'vercel' }],
    }),
    expected: ['vercel'],
    forbidden: [
      'nginx',
      'apache',
      'iis',
      'caddy',
      'cloudflare',
      'fastly',
      'openresty',
      'litespeed',
      'tomcat',
    ],
  },

  {
    name: 'typo3',
    description: 'TYPO3 CMS (meta generator fingerprint)',
    category: 'cms',
    snapshot: makeSnapshot({
      metaTags: [{ name: 'generator', content: 'TYPO3' }],
    }),
    expected: ['typo3'],
    forbidden: [
      'wordpress',
      'joomla',
      'craft-cms',
      'mediawiki',
      'hugo',
      'jekyll',
      'ghost',
      'jekyll',
    ],
  },

  {
    name: 'joomla',
    description: 'Joomla CMS (meta generator + version)',
    category: 'cms',
    snapshot: makeSnapshot({
      metaTags: [{ name: 'generator', content: 'Joomla! 4.3.1' }],
    }),
    expected: ['joomla'],
    forbidden: ['wordpress', 'typo3', 'craft-cms', 'mediawiki', 'nextjs', 'hugo'],
  },

  {
    name: 'craft-cms',
    description: 'Craft CMS (meta generator + version)',
    category: 'cms',
    snapshot: makeSnapshot({
      metaTags: [{ name: 'generator', content: 'Craft CMS 4.5.3' }],
    }),
    expected: ['craft-cms'],
    forbidden: ['wordpress', 'typo3', 'joomla', 'mediawiki', 'nextjs', 'hugo'],
  },

  {
    name: 'mediawiki',
    description: 'MediaWiki (meta generator + version)',
    category: 'cms',
    snapshot: makeSnapshot({
      metaTags: [{ name: 'generator', content: 'MediaWiki 1.40.1' }],
    }),
    expected: ['mediawiki'],
    forbidden: ['wordpress', 'typo3', 'joomla', 'craft-cms', 'jekyll', 'ghost'],
  },

  {
    name: 'google-tag-manager',
    description: 'Google Tag Manager (googletagmanager.com script URL) — distinct from GA',
    category: 'analytics',
    snapshot: makeSnapshot({
      scripts: [{ src: 'https://www.googletagmanager.com/gtag/js?id=GTM-ABCD', content: '' }],
    }),
    expected: ['google-tag-manager'],
    forbidden: ['google-analytics', 'google-fonts', 'firebase', 'segment', 'matomo', 'plausible'],
  },

  {
    name: 'matomo',
    description: 'Matomo analytics (matomo.js script URL)',
    category: 'analytics',
    snapshot: makeSnapshot({
      scripts: [{ src: 'https://analytics.example.com/matomo.js', content: '' }],
    }),
    expected: ['matomo'],
    forbidden: ['google-analytics', 'google-tag-manager', 'plausible', 'segment'],
  },

  {
    name: 'segment',
    description: 'Segment (cdn.segment.com script URL)',
    category: 'analytics',
    snapshot: makeSnapshot({
      scripts: [{ src: 'https://cdn.segment.com/analytics.js', content: '' }],
    }),
    expected: ['segment'],
    forbidden: ['google-analytics', 'google-tag-manager', 'matomo', 'plausible'],
  },

  {
    name: 'htmx',
    description: 'HTMX (htmx.org script URL)',
    category: 'library',
    snapshot: makeSnapshot({
      scripts: [{ src: 'https://unpkg.com/htmx.org@1.9.10/dist/htmx.min.js', content: '' }],
    }),
    expected: ['htmx'],
    forbidden: ['alpinejs', 'turbo', 'stimulus', 'jquery', 'lodash'],
  },

  {
    name: 'turbo',
    description: 'Turbo (hotwired/turbo script URL)',
    category: 'library',
    snapshot: makeSnapshot({
      scripts: [{ src: 'https://unpkg.com/@hotwired/turbo@7.2.4/dist/turbo.min.js', content: '' }],
    }),
    expected: ['turbo'],
    forbidden: ['stimulus', 'htmx', 'alpinejs', 'bootstrap'],
  },

  {
    name: 'stimulus',
    description: 'Stimulus (hotwired/stimulus script URL)',
    category: 'library',
    snapshot: makeSnapshot({
      scripts: [
        { src: 'https://unpkg.com/@hotwired/stimulus@3.2.1/dist/stimulus.min.js', content: '' },
      ],
    }),
    expected: ['stimulus'],
    forbidden: ['turbo', 'htmx', 'alpinejs', 'bootstrap'],
  },

  {
    name: 'alpinejs',
    description: 'Alpine.js (alpinejs script URL)',
    category: 'library',
    snapshot: makeSnapshot({
      scripts: [{ src: 'https://unpkg.com/alpinejs@3.13.0/cjs/alpine.js', content: '' }],
    }),
    expected: ['alpinejs'],
    forbidden: ['vue', 'svelte', 'react', 'htmx', 'turbo'],
  },

  {
    name: 'bigcommerce',
    description: 'BigCommerce (bcapp.com script URL)',
    category: 'ecommerce',
    snapshot: makeSnapshot({
      scripts: [{ src: 'https://cdn.bcapp.com/storefront/sections/main.js', content: '' }],
    }),
    expected: ['bigcommerce'],
    forbidden: ['shopify', 'woocommerce', 'segment'],
  },

  {
    name: 'd3',
    description: 'D3 (d3.v script URL + version)',
    category: 'library',
    snapshot: makeSnapshot({
      scripts: [{ src: 'https://d3js.org/d3.v7.min.js', content: '' }],
    }),
    expected: ['d3'],
    forbidden: ['jquery', 'lodash', 'bootstrap', 'popperjs'],
  },

  {
    name: 'popperjs',
    description: 'Popper.js (@popperjs script URL)',
    category: 'library',
    snapshot: makeSnapshot({
      scripts: [
        {
          src: 'https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/dist/umd/popper.min.js',
          content: '',
        },
      ],
    }),
    expected: ['popperjs'],
    forbidden: ['bootstrap', 'jquery', 'd3', 'alpinejs'],
  },

  {
    name: 'ember',
    description: 'Ember.js (inline Ember. content fingerprint)',
    category: 'framework',
    snapshot: makeSnapshot({
      scripts: [{ src: null, content: 'Ember.VERSION = "4.12.0"; new Ember.Application();' }],
    }),
    expected: ['ember'],
    forbidden: ['backbone', 'react', 'vue', 'laravel'],
  },

  {
    name: 'backbone',
    description: 'Backbone.js (inline Backbone. content fingerprint)',
    category: 'framework',
    snapshot: makeSnapshot({
      scripts: [
        { src: null, content: 'var app = new Backbone.Router({}); Backbone.View.extend();' },
      ],
    }),
    expected: ['backbone'],
    forbidden: ['ember', 'react', 'vue', 'laravel'],
  },

  // ── Step 68: realworld corpus A–F ───────────────────────────────

  {
    name: 'corpus-A-wordpress-nginx-php-jquery',
    description:
      'Corpus A: WordPress blog behind nginx, PHP backend, jQuery (four WordPress modalities)',
    category: 'realworld',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'nginx/1.21.6 (Ubuntu)' },
        { name: 'X-Powered-By', value: 'PHP/8.2.10' },
      ],
      metaTags: [{ name: 'generator', content: 'WordPress 6.4.2' }],
      scripts: [
        { src: 'https://example.com/wp-content/themes/twentytwentythree/script.js', content: '' },
        { src: 'https://example.com/wp-includes/js/jquery/jquery.min.js', content: '' },
      ],
      links: [
        {
          rel: 'stylesheet',
          href: 'https://example.com/wp-content/themes/twentytwentythree/style.css',
          content: '<link>',
        },
      ],
      resources: [
        {
          url: 'https://example.com/robots.txt',
          type: 'robots',
          content: 'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-content/uploads/',
        },
        {
          url: 'https://example.com/style.css',
          type: 'css',
          content: '--wp--preset--color-primary: #000;\n.wp-block-group { }',
        },
      ],
    }),
    expected: ['wordpress', 'nginx', 'php', 'jquery'],
    forbidden: [
      'apache',
      'iis',
      'express',
      'cloudflare',
      'caddy',
      'openresty',
      'litespeed',
      'tomcat',
      'vercel',
      'fastly',
      'hugo',
      'jekyll',
      'ghost',
      'prestashop',
      'typo3',
      'joomla',
      'craft-cms',
      'mediawiki',
      'laravel',
      'nextjs',
      'nuxtjs',
      'gatsby',
      'react',
      'vue',
      'angular',
      'svelte',
      'astro',
      'ember',
      'backbone',
      'bootstrap',
      'lodash',
      'tailwind',
      'firebase',
      'shopify',
      'woocommerce',
      'bigcommerce',
      'google-fonts',
      'google-analytics',
      'plausible',
      'google-tag-manager',
      'matomo',
      'segment',
      'htmx',
      'turbo',
      'stimulus',
      'alpinejs',
      'd3',
      'popperjs',
    ],
  },

  {
    name: 'corpus-B-shopify-cloudflare-ga',
    description: 'Corpus B: Shopify storefront on Cloudflare with direct Google Analytics',
    category: 'realworld',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'cloudflare' }],
      links: [
        {
          rel: 'stylesheet',
          href: 'https://cdn.shopify.com/s/files/1/theme.css',
          content: '<link>',
        },
      ],
      scripts: [{ src: 'https://www.google-analytics.com/analytics.js', content: '' }],
    }),
    expected: ['cloudflare', 'shopify', 'google-analytics'],
    forbidden: [
      'google-fonts',
      'google-tag-manager',
      'nginx',
      'apache',
      'iis',
      'caddy',
      'openresty',
      'litespeed',
      'tomcat',
      'vercel',
      'fastly',
    ],
  },

  {
    name: 'corpus-C-react-next-vercel',
    description: 'Corpus C: React + Next.js rendered on Vercel',
    category: 'realworld',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'vercel' }],
      metaTags: [{ name: 'generator', content: 'Next.js' }],
      scripts: [
        { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
        {
          src: null,
          content: 'window.__NEXT_DATA__ = {"props":{}}; import ReactDOM from "react-dom";',
        },
      ],
    }),
    expected: ['vercel', 'nextjs', 'react'],
    forbidden: ['nuxtjs', 'gatsby', 'vue', 'angular', 'svelte', 'astro', 'laravel', 'express'],
  },

  {
    name: 'corpus-D-vue-nuxt',
    description: 'Corpus D: Vue.js + Nuxt.js SSR build',
    category: 'realworld',
    snapshot: makeSnapshot({
      metaTags: [{ name: 'generator', content: 'Nuxt.js' }],
      scripts: [
        { src: 'https://example.com/_nuxt/entry-abc.js', content: '' },
        { src: null, content: 'Vue.createApp({ el: "#app" });' },
      ],
    }),
    expected: ['nuxtjs', 'vue'],
    forbidden: ['nextjs', 'react', 'angular', 'svelte', 'astro', 'laravel', 'express', 'gatsby'],
  },

  {
    name: 'corpus-E-drupal-apache-php',
    description: 'Corpus E: Drupal site on Apache HTTPD behind PHP',
    category: 'realworld',
    snapshot: makeSnapshot({
      headers: [
        { name: 'Server', value: 'Apache/2.4.41 (Debian)' },
        { name: 'X-Powered-By', value: 'PHP/8.2' },
      ],
      scripts: [{ src: null, content: 'window.drupalSettings = {"path":"/"};' }],
    }),
    expected: ['apache', 'php', 'drupal'],
    forbidden: [
      'nginx',
      'iis',
      'caddy',
      'openresty',
      'litespeed',
      'tomcat',
      'cloudflare',
      'vercel',
      'fastly',
      'express',
      'wordpress',
      'hugo',
      'jekyll',
      'ghost',
      'prestashop',
      'typo3',
      'joomla',
      'craft-cms',
      'mediawiki',
      'laravel',
      'nextjs',
      'nuxtjs',
      'gatsby',
      'react',
      'vue',
      'angular',
      'svelte',
      'astro',
      'ember',
      'backbone',
      'bootstrap',
    ],
  },

  {
    name: 'corpus-F-static-empty',
    description: 'Corpus F: static site with no recognizable technology fingerprints',
    category: 'negative',
    snapshot: makeSnapshot({
      headers: [{ name: 'Server', value: 'Unknown' }],
      metaTags: [{ name: 'description', content: 'Just a static page' }],
    }),
    expected: [],
    forbidden: [],
  },
];
