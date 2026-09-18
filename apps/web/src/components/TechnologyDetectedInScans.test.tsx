/**
 * Unit tests for the TechnologyDetectedInScans pure presentation component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment
 * required, consistent with the existing node-based test setup.
 *
 * `next/link` is mocked to render a plain `<a>` tag, since `ScanCard`
 * (rendered inside TechnologyDetectedInScans) also uses `next/link`.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TechnologyDetectedInScans } from './TechnologyDetectedInScans.js';
import type { ScanSummary } from '../lib/types.js';

// Mock next/link to render a plain <a> tag (no router context needed)
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// ─── Test fixtures ───────────────────────────────────────────────────

function makeScan(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
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
  };
}

// ─── 1. Error state ─────────────────────────────────────────────────

describe('TechnologyDetectedInScans — error state', () => {
  it('renders an error message when scans is null', () => {
    const html = renderToString(<TechnologyDetectedInScans scans={null} />);
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('Detected in scans');
    expect(cleaned).toContain('Unable to load scan data for this technology.');
  });
});

// ─── 2. Empty state ─────────────────────────────────────────────────

describe('TechnologyDetectedInScans — empty state', () => {
  it('renders a factual empty state when no scans detected the technology', () => {
    const html = renderToString(<TechnologyDetectedInScans scans={[]} />);
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('Detected in scans');
    expect(cleaned).toContain('No scans have detected this technology yet.');
  });

  it('does not render any scan cards in the empty state', () => {
    const html = renderToString(<TechnologyDetectedInScans scans={[]} />);
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).not.toContain('View details');
  });
});

// ─── 3. Populated state ─────────────────────────────────────────────

describe('TechnologyDetectedInScans — populated state', () => {
  it('renders a heading with the correct count for a single scan', () => {
    const html = renderToString(<TechnologyDetectedInScans scans={[makeScan()]} />);
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('Detected in 1 scan');
    expect(cleaned).not.toContain('Detected in 1 scans');
  });

  it('renders a heading with the correct count for multiple scans', () => {
    const html = renderToString(
      <TechnologyDetectedInScans
        scans={[
          makeScan({ id: 'scan_001', target: 'https://a.com/' }),
          makeScan({ id: 'scan_002', target: 'https://b.com/' }),
        ]}
      />,
    );
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('Detected in 2 scans');
  });

  it('renders a ScanCard for each matching scan', () => {
    const scans = [
      makeScan({ id: 'scan_001', target: 'https://a.com/', hostname: 'a.com' }),
      makeScan({ id: 'scan_002', target: 'https://b.com/', hostname: 'b.com' }),
      makeScan({ id: 'scan_003', target: 'https://c.com/', hostname: 'c.com' }),
    ];
    const html = renderToString(<TechnologyDetectedInScans scans={scans} />);
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('https://a.com/');
    expect(cleaned).toContain('https://b.com/');
    expect(cleaned).toContain('https://c.com/');
  });

  it('renders a link to the scan detail page for each card', () => {
    const scans = [makeScan({ id: 'scan_001' }), makeScan({ id: 'scan_002' })];
    const html = renderToString(<TechnologyDetectedInScans scans={scans} />);
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('/scans/scan_001');
    expect(cleaned).toContain('/scans/scan_002');
  });

  it('renders the status badge for each scan', () => {
    const scans = [
      makeScan({ id: 'scan_001', status: 'completed' }),
      makeScan({ id: 'scan_002', status: 'failed' }),
    ];
    const html = renderToString(<TechnologyDetectedInScans scans={scans} />);
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('Completed');
    expect(cleaned).toContain('Failed');
  });

  it('renders the scan creation timestamp as a time element', () => {
    const html = renderToString(
      <TechnologyDetectedInScans
        scans={[makeScan({ id: 'scan_001', createdAt: '2025-06-01T12:00:00.000Z' })]}
      />,
    );
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('2025-06-01T12:00:00.000Z');
  });
});

// ─── 4. Section structure ───────────────────────────────────────────

describe('TechnologyDetectedInScans — structure', () => {
  it('renders a section element with aria-labelledby in populated state', () => {
    const html = renderToString(<TechnologyDetectedInScans scans={[makeScan()]} />);
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('section');
    expect(cleaned).toContain('aria-labelledby');
  });

  it('renders a section element with aria-label in empty state', () => {
    const html = renderToString(<TechnologyDetectedInScans scans={[]} />);
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('aria-label="No detections found"');
  });

  it('renders a section element with aria-label in error state', () => {
    const html = renderToString(<TechnologyDetectedInScans scans={null} />);
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('aria-label="Scan data unavailable"');
  });
});
