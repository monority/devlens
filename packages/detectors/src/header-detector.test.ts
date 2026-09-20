import { describe, it, expect } from 'vitest';
import { HeaderDetector } from './header-detector.js';
import type { SiteSnapshot } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

// ─── Test helpers ───────────────────────────────────────────────────

function makeSnapshot(headers: Array<{ name: string; value: string }>): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers,
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: { title: 'Example', description: null, metaTags: [], scripts: [], links: [] },
    resources: [],
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('HeaderDetector', () => {
  const detector = new HeaderDetector();

  describe('Server header signatures', () => {
    it('detects nginx from Server header', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'nginx/1.21.6' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nginx');
      expect(detections[0]!.technology.name).toBe('nginx');
      expect(detections[0]!.technology.category).toBe('server');
      expect(detections[0]!.confidence).toBe(95);
      expect(detections[0]!.evidence[0]!.type).toBe('http_header');
      expect(detections[0]!.evidence[0]!).toMatchObject({ name: 'Server', value: 'nginx/1.21.6' });
    });

    it('detects Apache from Server header', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'Apache/2.4.52 (Debian)' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('apache');
      expect(detections[0]!.technology.name).toBe('Apache');
      expect(detections[0]!.technology.category).toBe('server');
      expect(detections[0]!.confidence).toBe(95);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        name: 'Server',
        value: 'Apache/2.4.52 (Debian)',
      });
    });

    it('detects IIS from Server header containing "Microsoft-IIS"', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'Microsoft-IIS/10.0' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('iis');
      expect(detections[0]!.technology.name).toBe('IIS');
      expect(detections[0]!.technology.category).toBe('server');
      expect(detections[0]!.confidence).toBe(95);
    });
  });

  describe('X-Powered-By header signatures', () => {
    it('detects Express from X-Powered-By header', () => {
      const snapshot = makeSnapshot([{ name: 'X-Powered-By', value: 'Express' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('express');
      expect(detections[0]!.technology.name).toBe('Express');
      expect(detections[0]!.technology.category).toBe('framework');
      expect(detections[0]!.confidence).toBe(90);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        name: 'X-Powered-By',
        value: 'Express',
      });
    });

    it('detects PHP from X-Powered-By header', () => {
      const snapshot = makeSnapshot([{ name: 'X-Powered-By', value: 'PHP/8.1' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('php');
      expect(detections[0]!.technology.name).toBe('PHP');
      expect(detections[0]!.technology.category).toBe('language');
      expect(detections[0]!.confidence).toBe(90);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        name: 'X-Powered-By',
        value: 'PHP/8.1',
      });
    });
  });

  describe('case-insensitive header names', () => {
    it('matches "server" (lowercase) header name', () => {
      const snapshot = makeSnapshot([{ name: 'server', value: 'nginx/1.21.6' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nginx');
      expect(detections[0]!.evidence[0]!).toMatchObject({
        name: 'server',
        value: 'nginx/1.21.6',
      });
    });

    it('matches "SERVER" (uppercase) header name', () => {
      const snapshot = makeSnapshot([{ name: 'SERVER', value: 'nginx/1.21.6' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nginx');
      expect(detections[0]!.evidence[0]!).toMatchObject({
        name: 'SERVER',
        value: 'nginx/1.21.6',
      });
    });

    it('matches "x-powered-by" (lowercase) header name', () => {
      const snapshot = makeSnapshot([{ name: 'x-powered-by', value: 'PHP/8.1' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('php');
    });

    it('matches "X-POWERED-BY" (uppercase) header name', () => {
      const snapshot = makeSnapshot([{ name: 'X-POWERED-BY', value: 'Express' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('express');
    });
  });

  describe('case-insensitive value matching', () => {
    it('detects nginx from lowercase "nginx" in value', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'nginx/1.21.6' }]);
      expect(detector.detect(snapshot)).toHaveLength(1);
    });

    it('detects Apache from mixed-case "Apache" in value', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'Apache/2.4.52' }]);
      expect(detector.detect(snapshot)).toHaveLength(1);
    });

    it('detects IIS from "Microsoft-IIS" in value (exact casing)', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'Microsoft-IIS/10.0' }]);
      expect(detector.detect(snapshot)).toHaveLength(1);
    });

    it('detects Express from lowercase "express" in value', () => {
      const snapshot = makeSnapshot([{ name: 'X-Powered-By', value: 'express' }]);
      expect(detector.detect(snapshot)).toHaveLength(1);
    });

    it('detects PHP from uppercase "PHP" in value', () => {
      const snapshot = makeSnapshot([{ name: 'X-Powered-By', value: 'PHP/8.1' }]);
      expect(detector.detect(snapshot)).toHaveLength(1);
    });
  });

  describe('multiple headers producing multiple detections', () => {
    it('detects multiple technologies from a single header', () => {
      // Apache server with PHP
      const snapshot = makeSnapshot([
        { name: 'Server', value: 'Apache/2.4.52' },
        { name: 'X-Powered-By', value: 'PHP/8.1' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(2);
      expect(detections.map((d) => d.technology.id).sort()).toEqual(['apache', 'php']);
    });

    it('detects multiple technologies from nginx + Express', () => {
      const snapshot = makeSnapshot([
        { name: 'Server', value: 'nginx/1.21.6' },
        { name: 'X-Powered-By', value: 'Express' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(2);
      expect(detections.map((d) => d.technology.id).sort()).toEqual(['express', 'nginx']);
    });
  });

  describe('deduplication', () => {
    it('does not produce duplicate detections for the same technology', () => {
      // Both headers could potentially match — but each tech has only one signature
      const snapshot = makeSnapshot([
        { name: 'Server', value: 'nginx/1.21.6' },
        { name: 'X-Powered-By', value: 'PHP/8.1' },
        { name: 'X-Powered-By', value: 'PHP/7.4' }, // duplicate PHP
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(2);
      const phpDetections = detections.filter((d) => d.technology.id === 'php');
      expect(phpDetections).toHaveLength(1);
    });
  });

  describe('no matches', () => {
    it('returns empty array when headers are missing', () => {
      const snapshot = makeSnapshot([]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('returns empty array for unrelated headers', () => {
      const snapshot = makeSnapshot([
        { name: 'Content-Type', value: 'text/html; charset=utf-8' },
        { name: 'Cache-Control', value: 'max-age=3600' },
        { name: 'X-Request-ID', value: 'abc-123' },
      ]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('returns empty array when Server header has unknown value', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'some-unknown-server/1.0' }]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('returns empty array when X-Powered-By has unknown value', () => {
      const snapshot = makeSnapshot([{ name: 'X-Powered-By', value: 'ASP.NET' }]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles empty header values gracefully', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: '' }]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('handles whitespace-only header values gracefully', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: '   ' }]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does not treat "php" in non-X-Powered-By headers as PHP', () => {
      // "php" appearing in a different header should not trigger PHP detection
      const snapshot = makeSnapshot([
        { name: 'Server', value: 'nginx/1.21.6' },
        { name: 'Content-Type', value: 'application/php' },
      ]);
      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nginx');
    });
  });

  describe('Domain contract conformance', () => {
    it('produces Detection objects that conform to @devlens/core contracts', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'nginx/1.21.6' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      const d = detections[0]!;

      // Technology has required fields
      expect(d.technology.id).toBe('nginx');
      expect(d.technology.name).toBe('nginx');
      expect(d.technology.category).toBe('server');

      // Confidence is in [0, 100]
      expect(d.confidence).toBeGreaterThanOrEqual(0);
      expect(d.confidence).toBeLessThanOrEqual(100);

      // Evidence is a non-empty array with type discriminant
      expect(d.evidence).toHaveLength(1);
      expect(d.evidence[0]!.type).toBe('http_header');

      // Evidence has name and value
      const evidence = d.evidence[0]!;
      if (evidence.type === 'http_header') {
        expect(evidence.name).toBe('Server');
        expect(evidence.value).toBe('nginx/1.21.6');
      }
    });
  });

  describe('version extraction', () => {
    it('extracts the nginx version from the Server header', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'nginx/1.21.6' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBe('1.21.6');
    });

    it('extracts nginx version when the token has a trailing OS bracket', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'nginx/1.25.2 (Ubuntu)' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBe('1.25.2');
    });

    it('extracts the Apache version (case-insensitive value match)', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'Apache/2.4.52 (Debian)' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBe('2.4.52');
    });

    it('extracts the IIS version', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'Microsoft-IIS/10.0' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBe('10.0');
    });

    it('extracts the PHP version from X-Powered-By', () => {
      const snapshot = makeSnapshot([{ name: 'X-Powered-By', value: 'PHP/8.1' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBe('8.1');
    });

    it('extracts a multi-part PHP version', () => {
      const snapshot = makeSnapshot([{ name: 'X-Powered-By', value: 'PHP/8.2.10' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBe('8.2.10');
    });

    it('does not extract a version for Express (no version rule)', () => {
      const snapshot = makeSnapshot([{ name: 'X-Powered-By', value: 'Express' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBeNull();
    });

    it('does not extract a version for Cloudflare (no version rule)', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'cloudflare' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBeNull();
    });

    it('yields null version when the signature matches but no version is present', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'nginx' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.technology.id).toBe('nginx');
      expect(d.version).toBeNull();
    });

    it('version extraction does not alter the detection confidence', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'nginx/1.21.6' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.confidence).toBe(95);
      expect(d.version).toBe('1.21.6');
    });
  });
});
