/**
 * Pure, deterministic unit tests for the discovery / classification /
 * selection pipeline (Step 70). These exercise `resource-intelligence.ts`
 * with NO network — only the pure functions under test.
 */

import { describe, it, expect } from 'vitest';
import {
  discoverResources,
  selectResources,
  classifyResource,
  canonicalizeUrl,
  compareResources,
  DEFAULT_RESOURCE_POLICY,
} from './resource-intelligence.js';
import type { HtmlExtract } from './html-parser.js';
import type { ResourceType } from '@devlens/core';

const PAGE = 'https://example.com/page';

// ── canonicalizeUrl ────────────────────────────────────────────────

describe('canonicalizeUrl', () => {
  it('resolves a relative path against the page URL and lowercases the host', () => {
    expect(canonicalizeUrl('/app.css', PAGE)).toBe('https://example.com/app.css');
  });

  it('strips the fragment (irrelevant for resource identity)', () => {
    expect(canonicalizeUrl('/app.js#section', PAGE)).toBe('https://example.com/app.js');
  });

  it('resolves protocol-relative and absolute URLs', () => {
    expect(canonicalizeUrl('//cdn.example.com/a.js', PAGE)).toBe('https://cdn.example.com/a.js');
    expect(canonicalizeUrl('https://other.example.com/x.css', PAGE)).toBe(
      'https://other.example.com/x.css',
    );
  });

  it('rejects non-http(s) schemes', () => {
    expect(canonicalizeUrl('data:text/css,body{color:red}', PAGE)).toBeNull();
    expect(canonicalizeUrl('javascript:alert(1)', PAGE)).toBeNull();
    expect(canonicalizeUrl('blob:https://example.com/uuid', PAGE)).toBeNull();
  });

  it('rejects empty, malformed, and non-URL strings', () => {
    expect(canonicalizeUrl('', PAGE)).toBeNull();
    expect(canonicalizeUrl('   ', PAGE)).toBeNull();
    expect(canonicalizeUrl('http://[', PAGE)).toBeNull(); // invalid URL (unbalanced bracket)
  });

  it('strips a trailing dot from the host', () => {
    expect(canonicalizeUrl('https://example.com./app.css', PAGE)).toBe(
      'https://example.com/app.css',
    );
  });
});

// ── discoverResources ──────────────────────────────────────────────

function html(extra: Partial<HtmlExtract> = {}): HtmlExtract {
  return {
    title: '',
    description: null,
    metaTags: [],
    scripts: [],
    stylesheetLinks: [],
    manifestLink: null,
    linkTags: [],
    ...extra,
  };
}

describe('discoverResources', () => {
  it('discovers robots.txt from the page origin', () => {
    const found = discoverResources(html(), PAGE);
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({
      url: 'https://example.com/robots.txt',
      kind: 'robots',
      sourcePage: PAGE,
    });
  });

  it('discovers manifest, scripts, stylesheets, and favicons from context', () => {
    const found = discoverResources(
      html({
        manifestLink: '/manifest.json',
        scripts: [
          { src: '/app.js', content: '' },
          { src: null, content: 'inline' },
        ],
        stylesheetLinks: ['/style.css'],
        linkTags: [{ rel: 'icon', href: '/favicon.ico', content: '<link>' }],
      }),
      PAGE,
    );

    expect(found).toHaveLength(5); // robots + manifest + 1 script + 1 css + 1 favicon
    const kinds = found.map((r) => r.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['robots', 'manifest', 'script', 'css', 'favicon']),
    );
  });

  it('ignores inline scripts (src is null)', () => {
    const found = discoverResources(
      html({ scripts: [{ src: null, content: 'window.x=1' }] }),
      PAGE,
    );
    expect(found).toHaveLength(1); // only robots
  });

  it('de-duplicates identical canonical URLs (first occurrence wins)', () => {
    const found = discoverResources(
      html({
        stylesheetLinks: ['/a.css', '/a.css', '/a.css'],
      }),
      PAGE,
    );
    const css = found.filter((r) => r.kind === 'css');
    expect(css).toHaveLength(1);
    expect(css[0]!.url).toBe('https://example.com/a.css');
  });

  it('treats path-cased URLs as distinct (URLs are case-sensitive in the path)', () => {
    const found = discoverResources(html({ stylesheetLinks: ['/a.css', '/A.CSS'] }), PAGE);
    const css = found.filter((r) => r.kind === 'css');
    expect(css).toHaveLength(2);
  });

  it('classifies a <link rel=stylesheet> as css (ResourceDetector compatibility)', () => {
    const found = discoverResources(html({ stylesheetLinks: ['/theme.css'] }), PAGE);
    expect(found.find((r) => r.url.endsWith('/theme.css'))?.kind).toBe('css');
  });

  it('classifies a <link rel="shortcut icon"> as favicon', () => {
    const found = discoverResources(
      html({ linkTags: [{ rel: 'shortcut icon', href: '/favicon.ico', content: '<link>' }] }),
      PAGE,
    );
    expect(found.find((r) => r.url.endsWith('/favicon.ico'))?.kind).toBe('favicon');
  });

  it('does not discover favicon from non-icon rel links', () => {
    const found = discoverResources(
      html({ linkTags: [{ rel: 'alternate', href: '/rss.xml', content: '<link>' }] }),
      PAGE,
    );
    expect(found.find((r) => r.kind === 'favicon')).toBeUndefined();
  });

  it('respects the observe* flags', () => {
    const policy = { ...DEFAULT_RESOURCE_POLICY, observeScripts: false, observeFavicons: false };
    const found = discoverResources(
      html({
        scripts: [{ src: '/app.js', content: '' }],
        linkTags: [{ rel: 'icon', href: '/favicon.ico', content: '<link>' }],
      }),
      PAGE,
      policy,
    );
    expect(found.find((r) => r.kind === 'script')).toBeUndefined();
    expect(found.find((r) => r.kind === 'favicon')).toBeUndefined();
    // robots still discovered
    expect(found.find((r) => r.kind === 'robots')).toBeDefined();
  });

  it('orders discoveries by (priority, canonical URL)', () => {
    const found = discoverResources(
      html({
        scripts: [
          { src: '/zeta.js', content: '' },
          { src: '/alpha.js', content: '' },
        ],
        stylesheetLinks: ['/style.css'],
        linkTags: [{ rel: 'icon', href: '/favicon.ico', content: '<link>' }],
      }),
      PAGE,
    );
    // scripts (priority 0) come before css (priority 2); within scripts, url asc.
    const scriptUrls = found.filter((r) => r.kind === 'script').map((r) => r.url);
    expect(scriptUrls).toEqual(['https://example.com/alpha.js', 'https://example.com/zeta.js']);
  });

  it('includes cross-origin resources (filtered at acquisition, not discovery)', () => {
    const found = discoverResources(
      html({ stylesheetLinks: ['https://cdn.example.com/x.css'] }),
      PAGE,
    );
    expect(found.find((r) => r.url === 'https://cdn.example.com/x.css')).toBeDefined();
  });

  it('is deterministic regardless of input array order', () => {
    const a = discoverResources(
      html({
        scripts: [
          { src: '/b.js', content: '' },
          { src: '/a.js', content: '' },
        ],
        stylesheetLinks: ['/z.css', '/a.css'],
        linkTags: [{ rel: 'icon', href: '/f.ico', content: '<link>' }],
      }),
      PAGE,
    );
    const b = discoverResources(
      html({
        scripts: [
          { src: '/a.js', content: '' },
          { src: '/b.js', content: '' },
        ],
        stylesheetLinks: ['/a.css', '/z.css'],
        linkTags: [{ rel: 'icon', href: '/f.ico', content: '<link>' }],
      }),
      PAGE,
    );
    expect(a).toEqual(b);
    // Deterministic order: scripts (priority 0, url asc) → css (2) → favicon (3) → robots (5).
    expect(a.map((r) => r.url)).toEqual([
      'https://example.com/a.js',
      'https://example.com/b.js',
      'https://example.com/a.css',
      'https://example.com/z.css',
      'https://example.com/f.ico',
      'https://example.com/robots.txt',
    ]);
  });
});

// ── classifyResource ───────────────────────────────────────────────

describe('classifyResource', () => {
  it('classifies by URL extension when no Content-Type is available', () => {
    expect(classifyResource('https://example.com/a.js', 'other')).toBe('script');
    expect(classifyResource('https://example.com/a.mjs', 'other')).toBe('script');
    expect(classifyResource('https://example.com/s.css', 'other')).toBe('css');
    expect(classifyResource('https://example.com/i.png', 'other')).toBe('image');
    expect(classifyResource('https://example.com/f.woff2', 'other')).toBe('font');
  });

  it('Content-Type overrides extension when confident', () => {
    expect(classifyResource('https://example.com/data', 'other', 'text/css')).toBe('css');
    expect(classifyResource('https://example.com/data', 'css', 'application/javascript')).toBe(
      'script',
    );
  });

  it('a favicon declared by HTML context stays favicon even if served as image/*', () => {
    expect(classifyResource('https://example.com/favicon.ico', 'favicon', 'image/x-icon')).toBe(
      'favicon',
    );
    expect(classifyResource('https://example.com/favicon.ico', 'favicon', null)).toBe('favicon');
  });

  it('preserves a known discovery-context kind when MIME/extension are uninformative', () => {
    expect(classifyResource('https://example.com/robots.txt', 'robots', 'text/plain')).toBe(
      'robots',
    );
    expect(classifyResource('https://example.com/manifest', 'manifest', null)).toBe('manifest');
  });

  it('falls back to "other" for genuinely unknown resources', () => {
    expect(classifyResource('https://example.com/unknown.xyz', 'other', null)).toBe('other');
  });

  it('is deterministic and pure (same input → same output)', () => {
    const r1 = classifyResource('https://example.com/a.css', 'css', 'text/css');
    const r2 = classifyResource('https://example.com/a.css', 'css', 'text/css');
    expect(r1).toBe(r2);
  });
});

// ── selectResources ────────────────────────────────────────────────

describe('selectResources', () => {
  it('selects all within an unbudgeted input and reports none skipped', () => {
    const discovered = [
      { url: 'https://example.com/a.js', kind: 'script' as ResourceType, sourcePage: PAGE },
      { url: 'https://example.com/b.css', kind: 'css' as ResourceType, sourcePage: PAGE },
    ];
    const result = selectResources(discovered, DEFAULT_RESOURCE_POLICY);
    expect(result.selected).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
  });

  it('enforces maxTotal budget (excess is skipped)', () => {
    const policy = {
      ...DEFAULT_RESOURCE_POLICY,
      maxTotal: 2,
      maxPerKind: {
        script: 20,
        stylesheet: 0,
        css: 10,
        image: 0,
        font: 0,
        video: 0,
        audio: 0,
        document: 0,
        robots: 8,
        manifest: 4,
        favicon: 4,
        other: 8,
      },
    };
    const discovered: { url: string; kind: ResourceType; sourcePage: string }[] = Array.from(
      { length: 5 },
      (_, i) => ({
        url: `https://example.com/s${i}.js`,
        kind: 'script',
        sourcePage: PAGE,
      }),
    );

    const result = selectResources(discovered, policy);
    expect(result.selected).toHaveLength(2);
    expect(result.skipped).toHaveLength(3);
    // Selected are the two lowest URLs by priority+url (both 'script', so url asc).
    expect(result.selected.map((r) => r.url)).toEqual([
      'https://example.com/s0.js',
      'https://example.com/s1.js',
    ]);
  });

  it('enforces per-kind cap independently of total budget', () => {
    const policy = {
      ...DEFAULT_RESOURCE_POLICY,
      maxTotal: 40,
      maxPerKind: {
        script: 20,
        stylesheet: 0,
        css: 1,
        image: 0,
        font: 0,
        video: 0,
        audio: 0,
        document: 0,
        robots: 8,
        manifest: 4,
        favicon: 4,
        other: 8,
      },
    };
    const discovered: { url: string; kind: ResourceType; sourcePage: string }[] = Array.from(
      { length: 4 },
      (_, i) => ({
        url: `https://example.com/c${i}.css`,
        kind: 'css',
        sourcePage: PAGE,
      }),
    );

    const result = selectResources(discovered, policy);
    expect(result.selected).toHaveLength(1);
    expect(result.skipped).toHaveLength(3);
  });

  it('selects higher-priority kinds before lower ones when total budget is tight', () => {
    const policy = {
      ...DEFAULT_RESOURCE_POLICY,
      maxTotal: 1,
      maxPerKind: {
        script: 20,
        stylesheet: 0,
        css: 10,
        image: 0,
        font: 0,
        video: 0,
        audio: 0,
        document: 0,
        robots: 8,
        manifest: 4,
        favicon: 4,
        other: 8,
      },
    };
    const discovered: { url: string; kind: ResourceType; sourcePage: string }[] = [
      { url: 'https://example.com/style.css', kind: 'css', sourcePage: PAGE },
      { url: 'https://example.com/app.js', kind: 'script', sourcePage: PAGE },
    ];
    const result = selectResources(discovered, policy);
    expect(result.selected).toHaveLength(1);
    // script (priority 0) wins over css (priority 2)
    expect(result.selected[0]!.kind).toBe('script');
  });

  it('produces identical ordering for permuted inputs (determinism)', () => {
    const discoveredA: { url: string; kind: ResourceType; sourcePage: string }[] = [
      { url: 'https://example.com/b.js', kind: 'script', sourcePage: PAGE },
      { url: 'https://example.com/a.css', kind: 'css', sourcePage: PAGE },
      { url: 'https://example.com/c.js', kind: 'script', sourcePage: PAGE },
    ];
    const discoveredB: { url: string; kind: ResourceType; sourcePage: string }[] = [
      { url: 'https://example.com/c.js', kind: 'script', sourcePage: PAGE },
      { url: 'https://example.com/a.css', kind: 'css', sourcePage: PAGE },
      { url: 'https://example.com/b.js', kind: 'script', sourcePage: PAGE },
    ];
    const r1 = selectResources(discoveredA, DEFAULT_RESOURCE_POLICY);
    const r2 = selectResources(discoveredB, DEFAULT_RESOURCE_POLICY);
    expect(r1).toEqual(r2);
    expect(r1.selected.map((r) => r.url)).toEqual([
      'https://example.com/b.js',
      'https://example.com/c.js',
      'https://example.com/a.css',
    ]);
  });

  it('empty input yields empty selected and skipped', () => {
    const result = selectResources([], DEFAULT_RESOURCE_POLICY);
    expect(result).toEqual({ selected: [], skipped: [] });
  });
});

// ── compareResources ───────────────────────────────────────────────

describe('compareResources', () => {
  it('sorts by priority then URL', () => {
    const items = [
      { type: 'css' as ResourceType, url: 'https://example.com/z.css' },
      { type: 'script' as ResourceType, url: 'https://example.com/b.js' },
      { type: 'script' as ResourceType, url: 'https://example.com/a.js' },
      { type: 'css' as ResourceType, url: 'https://example.com/a.css' },
    ];
    const sorted = [...items].sort((a, b) => compareResources(a, b, DEFAULT_RESOURCE_POLICY));
    expect(sorted.map((r) => `(${r.type},${r.url})`)).toEqual([
      '(script,https://example.com/a.js)',
      '(script,https://example.com/b.js)',
      '(css,https://example.com/a.css)',
      '(css,https://example.com/z.css)',
    ]);
  });
});
