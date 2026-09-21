import { describe, it, expect } from 'vitest';
import type { Resource, SiteSnapshot } from './snapshot.js';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from './value-objects.js';
import { getObservationCoverage } from './observation-coverage.js';

function res(overrides: Partial<Resource> = {}): Resource {
  return {
    url: createUrl('https://example.com/x'),
    type: 'script',
    size: 10,
    content: '',
    httpStatus: createHttpStatus(200),
    contentType: null,
    ...overrides,
  };
}

function snap(overrides: Partial<SiteSnapshot> = {}): SiteSnapshot {
  const base: SiteSnapshot = {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [{ name: 'content-type', value: 'text/html' }],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'T',
      description: null,
      metaTags: [],
      scripts: [],
      links: [],
    },
    resources: [],
  };
  return { ...base, ...overrides };
}

const byFamily = (c: ReturnType<typeof getObservationCoverage>, family: string) =>
  c.sources.find((s) => s.family === family)!;

describe('getObservationCoverage', () => {
  describe('absent snapshot', () => {
    it('returns an empty, all-not-observed coverage for null', () => {
      const c = getObservationCoverage(null);
      expect(c.discovered).toBe(0);
      expect(c.fetched).toBe(0);
      expect(c.failed).toBe(0);
      expect(c.skipped).toBe(0);
      expect(c.sources).toHaveLength(7);
      expect(c.sources.every((s) => s.status === 'not_observed')).toBe(true);
    });

    it('returns an empty coverage for undefined', () => {
      const c = getObservationCoverage(undefined);
      expect(c.sources.every((s) => s.status === 'not_observed')).toBe(true);
    });
  });

  describe('§2 HTML / HTTP surfaces', () => {
    it('reports header/meta/content/script_url/link as observed when present', () => {
      const c = getObservationCoverage(
        snap({
          http: {
            statusCode: createHttpStatus(200),
            headers: [
              { name: 'content-type', value: 'text/html' },
              { name: 'server', value: 'nginx' },
            ],
            contentType: 'text/html',
            finalUrl: createUrl('https://example.com'),
          },
          html: {
            title: 'T',
            description: 'd',
            metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
            scripts: [
              { src: 'https://cdn.example.com/a.js', content: '' },
              { src: null, content: 'window.__APP__=1;' },
            ],
            links: [{ rel: 'stylesheet', href: '/a.css', content: '' }],
          },
        }),
      );
      expect(byFamily(c, 'header').status).toBe('observed');
      expect(byFamily(c, 'meta').status).toBe('observed');
      expect(byFamily(c, 'content').status).toBe('observed');
      expect(byFamily(c, 'script_url').status).toBe('observed');
      expect(byFamily(c, 'link').status).toBe('observed');
    });

    it('reports surfaces as not_observed when absent', () => {
      const c = getObservationCoverage(
        snap({
          http: {
            statusCode: createHttpStatus(200),
            headers: [],
            contentType: 'text/html',
            finalUrl: createUrl('https://example.com'),
          },
        }),
      );
      expect(byFamily(c, 'header').status).toBe('not_observed');
      expect(byFamily(c, 'meta').status).toBe('not_observed');
      expect(byFamily(c, 'content').status).toBe('not_observed');
      expect(byFamily(c, 'script_url').status).toBe('not_observed');
      expect(byFamily(c, 'link').status).toBe('not_observed');
    });
  });

  describe('§5 resource acquisition counts', () => {
    it('Case A (§15): 0 resources -> resource surfaces not_observed, all counts 0', () => {
      const c = getObservationCoverage(snap({ resources: [] }));
      expect(c.fetched).toBe(0);
      expect(c.failed).toBe(0);
      expect(c.skipped).toBe(0);
      expect(c.discovered).toBe(0);
      expect(c.selected).toBe(0);
      expect(byFamily(c, 'resource_url').status).toBe('not_observed');
      expect(byFamily(c, 'resource_content').status).toBe('not_observed');
    });

    it('Case B (§15): 2 skipped resources -> skipped=2', () => {
      const c = getObservationCoverage(
        snap({
          resources: [
            res({
              acquisitionStatus: 'skipped',
              failureReason: 'skipped: blocked by SSRF/same-origin policy',
            }),
            res({ acquisitionStatus: 'skipped' }),
          ],
        }),
      );
      expect(c.skipped).toBe(2);
      expect(c.fetched).toBe(0);
      expect(c.failed).toBe(0);
      expect(byFamily(c, 'resource_content').status).toBe('skipped');
    });

    it('Case C (§15): 1 fetched + 1 skipped -> fetched=1, skipped=1 (detection-independent)', () => {
      const c = getObservationCoverage(
        snap({
          resources: [
            res({ acquisitionStatus: 'fetched', content: 'fetch me' }),
            res({
              acquisitionStatus: 'skipped',
              failureReason: 'skipped: blocked by SSRF/same-origin policy',
            }),
          ],
        }),
      );
      expect(c.fetched).toBe(1);
      expect(c.skipped).toBe(1);
    });

    it('classifies fetched/failed/skipped/discovered/selected into the right buckets', () => {
      const c = getObservationCoverage(
        snap({
          resources: [
            res({ acquisitionStatus: 'fetched', content: 'x' }),
            res({ acquisitionStatus: 'fetched', content: 'y' }),
            res({ acquisitionStatus: 'failed', failureReason: 'http_404' }),
            res({
              acquisitionStatus: 'skipped',
              failureReason: 'skipped: blocked by SSRF/same-origin policy',
            }),
            res({ acquisitionStatus: 'discovered' }),
            res({ acquisitionStatus: 'selected' }),
          ],
        }),
      );
      expect(c.fetched).toBe(2);
      expect(c.failed).toBe(1);
      expect(c.skipped).toBe(1);
      expect(c.discovered).toBe(1);
      expect(c.selected).toBe(1);
    });
  });

  describe('§7 / §9: factual, non-collapsing statuses', () => {
    it('failed-only is `failed` (not collapsed into skipped/blocked)', () => {
      const c = getObservationCoverage(
        snap({ resources: [res({ acquisitionStatus: 'failed', failureReason: 'http_404' })] }),
      );
      expect(c.failed).toBe(1);
      expect(byFamily(c, 'resource_url').status).toBe('failed');
      expect(byFamily(c, 'resource_content').status).toBe('failed');
      expect(byFamily(c, 'resource_url').failureReasons).toEqual(['http_404']);
    });

    it('skipped-only is `skipped` (distinguishable from failed)', () => {
      const c = getObservationCoverage(
        snap({ resources: [res({ acquisitionStatus: 'skipped' })] }),
      );
      expect(c.skipped).toBe(1);
      expect(byFamily(c, 'resource_url').status).toBe('skipped');
      expect(byFamily(c, 'resource_content').status).toBe('skipped');
    });

    it('never fabricates a reason for a skipped-without-failureReason resource', () => {
      const c = getObservationCoverage(
        snap({ resources: [res({ acquisitionStatus: 'skipped' })] }),
      );
      const url = byFamily(c, 'resource_url');
      expect(url.status).toBe('skipped');
      expect(url.failureReasons).toBeUndefined();
    });

    it('fetched + failed -> partial (mixed, success present)', () => {
      const c = getObservationCoverage(
        snap({
          resources: [
            res({ acquisitionStatus: 'fetched', content: 'x' }),
            res({ acquisitionStatus: 'failed', failureReason: 'timeout' }),
          ],
        }),
      );
      const url = byFamily(c, 'resource_url');
      expect(url.fetched).toBe(1);
      expect(url.failed).toBe(1);
      expect(url.status).toBe('partial');
      expect(url.failureReasons).toEqual(['timeout']);
    });

    it('failed + skipped (no fetched) -> partial, preserving both outcomes', () => {
      const c = getObservationCoverage(
        snap({
          resources: [
            res({ acquisitionStatus: 'failed', failureReason: 'network_error' }),
            res({
              acquisitionStatus: 'skipped',
              failureReason: 'skipped: blocked by SSRF/same-origin policy',
            }),
          ],
        }),
      );
      const url = byFamily(c, 'resource_url');
      expect(url.status).toBe('partial');
      expect(url.failed).toBe(1);
      expect(url.skipped).toBe(1);
      expect(url.failureReasons?.sort()).toEqual([
        'network_error',
        'skipped: blocked by SSRF/same-origin policy',
      ]);
    });
  });

  describe('§4: resource_url vs resource_content stay distinct', () => {
    it('a discovered (URL-known, no body) resource is url-observed but content not_observed', () => {
      const c = getObservationCoverage(
        snap({ resources: [res({ acquisitionStatus: 'discovered' })] }),
      );
      expect(byFamily(c, 'resource_url').status).toBe('observed');
      expect(byFamily(c, 'resource_content').status).toBe('not_observed');
    });

    it('legacy controlled-observation resource (no status, content present) is fetched on both surfaces', () => {
      const c = getObservationCoverage(snap({ resources: [res({ content: 'User-agent: *' })] }));
      expect(c.fetched).toBe(1);
      expect(byFamily(c, 'resource_url').status).toBe('observed');
      expect(byFamily(c, 'resource_content').status).toBe('observed');
    });
  });

  describe('§6: failureReason is verbatim', () => {
    it('dedupes + sorts failure reasons', () => {
      const c = getObservationCoverage(
        snap({
          resources: [
            res({ acquisitionStatus: 'failed', failureReason: 'http_500' }),
            res({ acquisitionStatus: 'failed', failureReason: 'http_500' }),
            res({
              acquisitionStatus: 'skipped',
              failureReason: 'skipped: blocked by SSRF/same-origin policy',
            }),
          ],
        }),
      );
      expect(byFamily(c, 'resource_url').failureReasons).toEqual([
        'http_500',
        'skipped: blocked by SSRF/same-origin policy',
      ]);
    });
  });

  describe('determinism (§8)', () => {
    it('sources are returned in stable §4 family order', () => {
      const c = getObservationCoverage(
        snap({ resources: [res({ acquisitionStatus: 'fetched', content: 'x' })] }),
      );
      expect(c.sources.map((s) => s.family)).toEqual([
        'header',
        'meta',
        'content',
        'script_url',
        'link',
        'resource_url',
        'resource_content',
      ]);
    });

    it('is deterministic across identical inputs', () => {
      const r = res({ acquisitionStatus: 'fetched', content: 'x' });
      const c1 = getObservationCoverage(snap({ resources: [r] }));
      const c2 = getObservationCoverage(snap({ resources: [r] }));
      expect(c1).toEqual(c2);
    });
  });
});
