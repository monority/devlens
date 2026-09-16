/**
 * Unit tests for the pure scan export functions.
 *
 * Tests the export mapping (`scanToExport`), serialization
 * (`serializeExport`), filename generation (`safeExportFilename`),
 * and download trigger (`triggerDownload`).
 *
 * These are pure-function tests — no React rendering, no DOM.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scanToExport,
  serializeExport,
  safeExportFilename,
  triggerDownload,
  EXPORT_FORMAT,
  EXPORT_VERSION,
} from './export-scan.js';
import type { ScanDetailResponse, DetectionResponse, EvidenceResponse } from './types.js';

// ─── Fixtures ────────────────────────────────────────────────────────

function makeDetection(
  id: string,
  name: string,
  category: string,
  confidence: number,
  evidence: EvidenceResponse[] = [],
): DetectionResponse {
  return {
    technology: { id, name, category },
    confidence,
    evidence,
  };
}

function makeScanDetail(
  overrides: Partial<{
    id: string;
    status: string;
    target: string;
    hostname: string;
    createdAt: string;
    completedAt: string | null;
    failedAt: string | null;
    error: { code: string; message: string } | null;
  }> = {},
  detections: DetectionResponse[] = [],
): ScanDetailResponse {
  return {
    scan: {
      id: 'scan_001',
      status: 'completed',
      target: 'https://example.com/',
      hostname: 'example.com',
      createdAt: '2025-06-01T12:00:00.000Z',
      startedAt: null,
      completedAt: '2025-06-01T12:00:05.000Z',
      failedAt: null,
      error: null,
      ...overrides,
    },
    snapshot: null,
    detections,
  };
}

// ─── Pure export tests ───────────────────────────────────────────────

describe('scanToExport', () => {
  it('exports a completed scan with correct format and version fields', () => {
    const result = makeScanDetail({}, [makeDetection('react', 'React', 'frontend', 95)]);

    const doc = scanToExport(result);

    expect(doc.format).toBe('devlens.scan');
    expect(doc.version).toBe(1);
    expect(doc.scan.id).toBe('scan_001');
    expect(doc.scan.target).toBe('https://example.com/');
    expect(doc.detections).toHaveLength(1);
  });

  it('preserves failure information for failed scans without fabricating success', () => {
    const result = makeScanDetail({
      status: 'failed',
      error: { code: 'timeout', message: 'Request timed out after 30s' },
      failedAt: '2025-06-01T12:00:10.000Z',
      completedAt: null,
    });

    const doc = scanToExport(result);

    expect(doc.scan.status).toBe('failed');
    expect(doc.scan.error).toEqual({ code: 'timeout', message: 'Request timed out after 30s' });
    expect(doc.scan.failedAt).toBe('2025-06-01T12:00:10.000Z');
    expect(doc.scan.completedAt).toBeNull();
  });

  it('exports zero-detection scans correctly', () => {
    const result = makeScanDetail({}, []);

    const doc = scanToExport(result);

    expect(doc.detections).toHaveLength(0);
    expect(doc.scan.status).toBe('completed');
  });

  it('preserves detection ordering for multiple detections', () => {
    const detections = [
      makeDetection('vue', 'Vue', 'frontend', 80),
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('nginx', 'Nginx', 'infra', 70),
    ];
    const result = makeScanDetail({}, detections);

    const doc = scanToExport(result);

    expect(doc.detections).toHaveLength(3);
    expect(doc.detections[0]!.technology.name).toBe('Vue');
    expect(doc.detections[1]!.technology.name).toBe('React');
    expect(doc.detections[2]!.technology.name).toBe('Nginx');
  });

  it('preserves all evidence types', () => {
    const evidence: EvidenceResponse[] = [
      { type: 'html', selector: '<title>', snippet: '<title>Test Site</title>' },
      { type: 'http_header', name: 'Server', value: 'nginx/1.21.0' },
      { type: 'script_url', url: 'https://cdn.example.com/bundle.js' },
      { type: 'script_content', snippet: 'console.log("hello")' },
      { type: 'meta_tag', name: 'description', content: 'A test site' },
      { type: 'javascript_global', globalName: 'jQuery' },
      { type: 'resource', url: 'https://fonts.example.com/font.woff2' },
      { type: 'link', url: 'https://example.com/style.css' },
    ];
    const detections = [makeDetection('all', 'All Evidence', 'test', 90, evidence)];
    const result = makeScanDetail({}, detections);

    const doc = scanToExport(result);

    expect(doc.detections[0]!.evidence).toEqual(evidence);
    for (const [i, ev] of doc.detections[0]!.evidence.entries()) {
      expect(ev.type).toBe(evidence[i]!.type);
    }
  });

  it('produces deterministic JSON for the same input', () => {
    const result = makeScanDetail({}, [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);

    const json1 = serializeExport(result);
    const json2 = serializeExport(result);

    expect(json1).toBe(json2);
  });

  it('does not mutate the input object', () => {
    const result = makeScanDetail({}, [makeDetection('react', 'React', 'frontend', 95)]);
    const scanBefore = JSON.stringify(result.scan);
    const detectionsBefore = JSON.stringify(result.detections);

    scanToExport(result);

    // Input object values should be unchanged
    expect(JSON.stringify(result.scan)).toBe(scanBefore);
    expect(JSON.stringify(result.detections)).toBe(detectionsBefore);
  });

  it('handles special characters in URLs, evidence, and technology names', () => {
    const result = makeScanDetail(
      {
        target: 'https://example.com/path?q=search&lang=fr&special=éàü',
        hostname: 'example.com',
      },
      [
        makeDetection('wp', 'WordPress <script>', 'cms', 88, [
          { type: 'http_header', name: 'X-Custom', value: 'value with <html> & "quotes"' },
          { type: 'html', selector: '<meta>', snippet: '<div class="test"> café ☕ </div>' },
        ]),
      ],
    );

    const json = serializeExport(result);

    const parsed = JSON.parse(json);
    expect(parsed.scan.target).toBe('https://example.com/path?q=search&lang=fr&special=éàü');
    expect(parsed.detections[0].technology.name).toBe('WordPress <script>');
    expect(parsed.detections[0].evidence[0].value).toBe('value with <html> & "quotes"');
    expect(parsed.detections[0].evidence[1].snippet).toBe('<div class="test"> café ☕ </div>');
  });

  it('uses correct format and version constants', () => {
    expect(EXPORT_FORMAT).toBe('devlens.scan');
    expect(EXPORT_VERSION).toBe(1);

    const result = makeScanDetail({});
    const parsed = JSON.parse(serializeExport(result));
    expect(parsed.format).toBe('devlens.scan');
    expect(parsed.version).toBe(1);
  });
});

// ─── Filename tests ──────────────────────────────────────────────────

describe('safeExportFilename', () => {
  it('uses scan ID for the filename', () => {
    expect(safeExportFilename('scan_001')).toBe('devlens-scan_001.json');
  });

  it('does not expose the target URL as the filename', () => {
    const filename = safeExportFilename('abc-123');
    expect(filename).not.toContain('example.com');
    expect(filename).toBe('devlens-abc-123.json');
  });

  it('sanitizes unsafe characters in scan ID', () => {
    // Slashes and dots are replaced with underscores
    expect(safeExportFilename('scan_abc.def')).toBe('devlens-scan_abc_def.json');
  });
});

// ─── Download trigger tests ──────────────────────────────────────────

describe('triggerDownload', () => {
  let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(mockAnchor),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a Blob with application/json content type', () => {
    triggerDownload('{"test":true}', 'devlens-scan_001.json');

    const createSpy = vi.mocked(URL.createObjectURL);
    const blobArg = createSpy.mock.calls[0]?.[0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect((blobArg as Blob).type).toBe('application/json');
  });

  it('revokes the object URL after download (cleanup)', () => {
    triggerDownload('{"test":true}', 'devlens-scan_001.json');

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('sets the download filename and triggers click', () => {
    triggerDownload('{"format":"devlens.scan"}', 'devlens-test-123.json');

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockAnchor.download).toBe('devlens-test-123.json');
    expect(mockAnchor.click).toHaveBeenCalled();
  });
});
