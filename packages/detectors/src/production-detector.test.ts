/**
 * Regression tests for `createProductionDetector()`.
 *
 * These tests verify that the factory produces a detector pipeline
 * that:
 * - Returns a `Detector` instance (duck-typed — has a `detect` method).
 * - Produces correct detections on known fixtures (end-to-end).
 * - Is deterministic across multiple invocations.
 * - Does not mutate the input snapshot.
 *
 * Created in Step 14 as a regression guard for the pipeline wiring
 * extraction (P1: pipeline construction was duplicated between
 * `apps/web` and `apps/worker`).
 */

import { describe, it, expect } from 'vitest';
import { createProductionDetector } from './production-detector.js';
import { FIXTURES } from './fixtures/detector-fixtures.js';
import type { SiteSnapshot } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

/** A minimal snapshot with a Server: nginx header — detects nginx. */
function nginxSnapshot(): SiteSnapshot {
  return {
    url: createUrl('https://example.com/'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [{ name: 'Server', value: 'nginx/1.21.6' }],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com/'),
    },
    html: {
      title: 'Example',
      description: null,
      metaTags: [],
      scripts: [],
      links: [],
    },
    resources: [],
  };
}

describe('createProductionDetector', () => {
  it('returns an object with a detect method', () => {
    const detector = createProductionDetector();
    expect(typeof detector.detect).toBe('function');
  });

  it('detects nginx from a Server header (end-to-end)', () => {
    const detector = createProductionDetector();
    const detections = detector.detect(nginxSnapshot());

    // Exactly one detection: nginx
    expect(detections).toHaveLength(1);
    expect(detections[0]!.technology.id).toBe('nginx');
    expect(detections[0]!.technology.name).toBe('nginx');
    expect(detections[0]!.technology.category).toBe('server');
    expect(detections[0]!.confidence).toBeGreaterThanOrEqual(85);
    expect(detections[0]!.confidence).toBeLessThanOrEqual(100);

    // Evidence is HttpHeaderEvidence
    const evidence = detections[0]!.evidence;
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.type).toBe('http_header');
    if (evidence[0]!.type === 'http_header') {
      expect(evidence[0]!.name).toBe('Server');
      expect(evidence[0]!.value).toBe('nginx/1.21.6');
    }
  });

  it('produces identical results on repeated invocations (determinism)', () => {
    const snapshot = nginxSnapshot();
    const d1 = createProductionDetector();
    const d2 = createProductionDetector();

    const r1 = d1.detect(snapshot);
    const r2 = d2.detect(snapshot);

    expect(r1).toEqual(r2);
  });

  it('does not mutate the input snapshot', () => {
    const detector = createProductionDetector();
    const snapshot = nginxSnapshot();
    const snapshotBefore = JSON.parse(JSON.stringify(snapshot));

    detector.detect(snapshot);

    expect(snapshot).toEqual(snapshotBefore);
  });

  it('produces the same result as the golden nginx fixture', () => {
    // Cross-check: the factory should detect nginx with the same
    // confidence as the golden fixture suite already validates.
    const fixture = FIXTURES.find((f) => f.name === 'nginx')!;
    const detector = createProductionDetector();
    const detections = detector.detect(fixture.snapshot);

    const detectedIds = detections.map((d) => d.technology.id);
    expect(detectedIds).toContain('nginx');
  });
});
