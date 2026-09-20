/**
 * Step 68 — version extraction for the newly-declared technologies.
 *
 * Each version rule declared on a catalog signature is exercised end-to-end
 * through the production pipeline against a realistic observable value, so
 * the declarative rules (caddy/openresty/tomcat/joomla/craft-cms/mediawiki/d3)
 * are pinned alongside the Step 67 rules. Techs with no version rule are
 * asserted to surface `null` (the conservative default).
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

function versionOf(snapshot: SiteSnapshot, id: string): string | null | undefined {
  const detection = createProductionDetector()
    .detect(snapshot)
    .find((d) => d.technology.id === id);
  return detection?.version ?? null;
}

describe('Step 68 technology version extraction', () => {
  it('extracts Caddy version from the Server header', () => {
    expect(
      versionOf(
        makeSnapshot({
          http: {
            statusCode: createHttpStatus(200),
            headers: [{ name: 'Server', value: 'Caddy/v2.8.4 (Fedora)' }],
            contentType: 'text/html',
            finalUrl: createUrl('https://example.com'),
          },
        }),
        'caddy',
      ),
    ).toBe('2.8.4');
  });

  it('extracts OpenResty version from the Server header', () => {
    expect(
      versionOf(
        makeSnapshot({
          http: {
            statusCode: createHttpStatus(200),
            headers: [{ name: 'Server', value: 'openresty/1.15.8.22' }],
            contentType: 'text/html',
            finalUrl: createUrl('https://example.com'),
          },
        }),
        'openresty',
      ),
    ).toBe('1.15.8.22');
  });

  it('extracts Tomcat version from Apache-Coyote Server header', () => {
    expect(
      versionOf(
        makeSnapshot({
          http: {
            statusCode: createHttpStatus(200),
            headers: [{ name: 'Server', value: 'Apache-Coyote/1.45' }],
            contentType: 'text/html',
            finalUrl: createUrl('https://example.com'),
          },
        }),
        'tomcat',
      ),
    ).toBe('1.45');
  });

  it('extracts Joomla version from the meta generator', () => {
    expect(
      versionOf(
        makeSnapshot({
          html: {
            title: 'Example',
            description: null,
            metaTags: [{ name: 'generator', content: 'Joomla! 4.3.1' }],
            scripts: [],
            links: [],
          },
        }),
        'joomla',
      ),
    ).toBe('4.3.1');
  });

  it('extracts Craft CMS version from the meta generator', () => {
    expect(
      versionOf(
        makeSnapshot({
          html: {
            title: 'Example',
            description: null,
            metaTags: [{ name: 'generator', content: 'Craft CMS 4.5.3' }],
            scripts: [],
            links: [],
          },
        }),
        'craft-cms',
      ),
    ).toBe('4.5.3');
  });

  it('extracts MediaWiki version from the meta generator', () => {
    expect(
      versionOf(
        makeSnapshot({
          html: {
            title: 'Example',
            description: null,
            metaTags: [{ name: 'generator', content: 'MediaWiki 1.40.1' }],
            scripts: [],
            links: [],
          },
        }),
        'mediawiki',
      ),
    ).toBe('1.40.1');
  });

  it('extracts D3 version from the d3.v script URL', () => {
    expect(
      versionOf(
        makeSnapshot({
          html: {
            title: 'Example',
            description: null,
            metaTags: [],
            scripts: [{ src: 'https://d3js.org/d3.v7.min.js', content: '' }],
            links: [],
          },
        }),
        'd3',
      ),
    ).toBe('7');
  });

  it('leaves conservative techs (LiteSpeed) without a version', () => {
    expect(
      versionOf(
        makeSnapshot({
          http: {
            statusCode: createHttpStatus(200),
            headers: [{ name: 'Server', value: 'LiteSpeed' }],
            contentType: 'text/html',
            finalUrl: createUrl('https://example.com'),
          },
        }),
        'litespeed',
      ),
    ).toBeNull();
  });
});
