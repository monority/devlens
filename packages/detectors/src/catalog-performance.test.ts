/**
 * Phase 14 — performance & determinism sanity for the Step 68 catalog.
 *
 * Proves the declarative catalog refactor did not regress the production
 * pipeline: a realistic multi-source snapshot (header + meta + script +
 * resource + link) is detected well within the budget, and three
 * consecutive runs serialize identically (the scorer's deterministic
 * `confidence DESC, id ASC` ranking is unchanged).
 */

import { describe, it, expect } from 'vitest';
import { createProductionDetector } from './production-detector.js';
import type { SiteSnapshot } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

function makeSnapshot(overrides: Partial<SiteSnapshot> = {}): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: { title: 'Example', description: null, metaTags: [], scripts: [], links: [] },
    resources: [],
    ...overrides,
  };
}

describe('catalog — performance & determinism (Phase 14)', () => {
  const pipeline = createProductionDetector();

  // A realistic multi-technology snapshot exercising every observable source
  // the catalog signatures draw from.
  const snapshot = makeSnapshot({
    http: {
      statusCode: createHttpStatus(200),
      headers: [
        { name: 'Server', value: 'nginx/1.21.6 (Ubuntu)' },
        { name: 'X-Powered-By', value: 'PHP/8.2.10' },
      ],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'Example',
      description: null,
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
    },
    resources: [
      {
        url: 'https://example.com/robots.txt',
        type: 'robots',
        content: 'User-agent: *\nDisallow: /wp-admin/',
      },
      {
        url: 'https://example.com/style.css',
        type: 'css',
        content: '--wp--preset--color-primary: #000;',
      },
    ],
  });

  const serialize = () =>
    JSON.stringify(
      pipeline
        .detect(snapshot)
        .map((d) => [d.technology.id, d.confidence, d.version ?? null] as const),
    );

  it('detects the multi-tech snapshot within the performance budget (< 50 ms)', () => {
    const start = Date.now();
    pipeline.detect(snapshot);
    const elapsed = Date.now() - start;
    // Detection is microsecond-scale; 50ms is a generous guard against
    // accidental quadratic behavior as the catalog grows.
    expect(elapsed).toBeLessThan(50);
  });

  it('determinism: three runs produce identical serialized results', () => {
    const a = serialize();
    const b = serialize();
    const c = serialize();
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('the catalog refactor preserved the canonical WordPress multi-source result', () => {
    const ranked = JSON.parse(serialize()).map((r: [string, number, string | null]) => r);
    const ids = ranked.map((r) => r[0]);
    expect(ids).toEqual(expect.arrayContaining(['wordpress', 'nginx', 'php', 'jquery']));
    // WordPress reaches 100 from 4 evidence types (meta_tag + script_url + resource + link).
    const wp = ranked.find((r) => r[0] === 'wordpress');
    expect(wp[1]).toBe(100);
  });
});
