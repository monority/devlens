/**
 * Unit tests for the ExportScanButton component.
 *
 * ExportScanButton is a 'use client' component using `useState`.
 * Since `renderToString` from `react-dom/server` does not execute
 * `useEffect` or event handlers, these tests focus on:
 *
 * - The initial render (button exists with correct label)
 * - The export pipeline: serializeExport produces valid JSON
 * - Filename generation: safeExportFilename produces correct name
 * - Download cleanup: triggerDownload revokes the object URL
 *
 * `next/link` is mocked to render plain `<a>` tags (matching the
 * project-wide test convention).
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ExportScanButton } from './ExportScanButton.js';
import {
  serializeExport,
  safeExportFilename,
  scanToExport,
  triggerDownload,
} from '../lib/export-scan.js';
import type { ScanDetailResponse, DetectionResponse, EvidenceResponse } from '../lib/types.js';

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
      hostname: 'example.com',
      target: 'https://example.com/',
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

// ─── Component tests ─────────────────────────────────────────────────

describe('ExportScanButton', () => {
  it('renders an "Export JSON" button with an accessible label', () => {
    const result = makeScanDetail();
    const html = renderToString(React.createElement(ExportScanButton, { result }));

    expect(html).toContain('Export JSON');
    expect(html).toContain('aria-label="Export scan as JSON"');
    expect(html).toContain('type="button"');
  });

  it('successful export produces valid JSON via serializeExport', () => {
    const result = makeScanDetail({}, [makeDetection('react', 'React', 'frontend', 95)]);

    const json = serializeExport(result);
    const parsed = JSON.parse(json);

    expect(parsed.format).toBe('devlens.scan');
    expect(parsed.version).toBe(1);
    expect(parsed.scan.id).toBe('scan_001');
    expect(parsed.detections).toHaveLength(1);
    expect(parsed.detections[0].technology.name).toBe('React');
  });

  it('generated filename uses scan ID and does not expose target URL', () => {
    const result = makeScanDetail({ id: 'abc-123-def' });

    const filename = safeExportFilename(result.scan.id);

    expect(filename).toBe('devlens-abc-123-def.json');
    expect(filename).not.toContain('example.com');
  });

  it('JSON content from scanToExport has the correct envelope shape', () => {
    const result = makeScanDetail({ id: 'scan_abc', target: 'https://site.test/' });

    const doc = scanToExport(result);

    // Top-level envelope keys (stable order)
    expect(Object.keys(doc)).toEqual(['format', 'version', 'scan', 'snapshot', 'detections']);
    // Content
    expect(doc.format).toBe('devlens.scan');
    expect(doc.version).toBe(1);
    expect(doc.scan.id).toBe('scan_abc');
    expect(doc.scan.target).toBe('https://site.test/');
    expect(doc.snapshot).toBeNull();
  });

  it('cleanup of object URL occurs after download trigger', () => {
    const mockAnchor = {
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

    triggerDownload('{"test":true}', 'devlens-scan_001.json');

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(mockAnchor.click).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
