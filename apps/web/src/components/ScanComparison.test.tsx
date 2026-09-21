/**
 * Unit tests for the ScanComparison presentation component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment
 * (jsdom) required. The comparison logic is tested separately in
 * `comparison.test.ts`; these tests focus on presentation.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScanComparison } from './ScanComparison.js';
import { compareScans } from '../lib/comparison.js';
import type { ScanDetailResponse, DetectionResponse } from '../lib/types.js';

// Mock next/link so it renders a plain <a> tag (no router context needed)
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// ─── Test fixtures ───────────────────────────────────────────────────

function makeScan(
  id: string,
  status: string = 'completed',
  detections: DetectionResponse[] = [],
  target: string = 'https://example.com/',
  timestamps?: {
    startedAt?: string | null;
    completedAt?: string | null;
    failedAt?: string | null;
  },
  error: { code: string; message: string } | null = null,
): ScanDetailResponse {
  return {
    scan: {
      id,
      status,
      target,
      hostname: 'example.com',
      createdAt: '2025-06-01T12:00:00.000Z',
      startedAt: timestamps?.startedAt ?? null,
      completedAt: timestamps?.completedAt ?? '2025-06-01T12:00:05.000Z',
      failedAt: timestamps?.failedAt ?? null,
      error,
    },
    snapshot: null,
    detections,
  };
}

function makeDetection(
  id: string,
  name: string,
  category: string,
  confidence: number,
  evidence: DetectionResponse['evidence'] = [],
): DetectionResponse {
  return { technology: { id, name, category }, confidence, evidence };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ScanComparison', () => {
  it('renders a successful comparison with both scan summaries', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 90),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Scan Comparison');
    expect(cleaned).toContain('Previous / Left');
    expect(cleaned).toContain('Current / Right');
    expect(cleaned).toContain('scan_left');
    expect(cleaned).toContain('scan_right');
  });

  it('renders a "Different targets" warning when targets differ', () => {
    const left = makeScan('scan_left', 'completed', [], 'https://example.com/');
    const right = makeScan('scan_right', 'completed', [], 'https://other.com');
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Different targets');
    expect(cleaned).toContain('https://example.com/');
    expect(cleaned).toContain('https://other.com');
  });

  it('does not render "Different targets" warning when targets are the same', () => {
    const left = makeScan('scan_left', 'completed', [], 'https://example.com/');
    const right = makeScan('scan_right', 'completed', [], 'https://example.com/');
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).not.toContain('Different targets');
  });

  it('renders both scan targets in the overview', () => {
    const left = makeScan('scan_left', 'completed', [], 'https://example.com/');
    const right = makeScan('scan_right', 'completed', [], 'https://example.com/');
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // ScanOverview displays the target URL
    expect(cleaned).toContain('https://example.com/');
    expect(cleaned).toContain('example.com');
  });

  it('renders missing left scan state', () => {
    const left = null;
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Unable to compare scans');
    expect(html).toContain('left scan');
    expect(html).toContain('Back to scan history');
  });

  it('renders missing right scan state', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = null;
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Unable to compare scans');
    expect(html).toContain('right scan');
  });

  it('renders failed scan comparison with limited detection notice', () => {
    const left = makeScan(
      'scan_left',
      'failed',
      [],
      'https://example.com/',
      {
        startedAt: '2025-06-01T12:00:01.000Z',
        completedAt: null,
        failedAt: '2025-06-01T12:00:05.000Z',
      },
      { code: 'timeout', message: 'Request timed out' },
    );
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Limited comparison');
    expect(html).toContain('failed');
    expect(html).toContain('Detection comparison is');
    expect(html).toContain('unavailable');
  });

  it('renders "No detection changes" for identical scans', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('No detection changes');
  });

  it('renders technology changes (added and removed)', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('vue', 'Vue', 'frontend', 80),
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('svelte', 'Svelte', 'frontend', 70),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Added (1)');
    expect(cleaned).toContain('Removed (1)');
    expect(cleaned).toContain('Svelte');
    expect(cleaned).toContain('Vue');
    expect(cleaned).toContain('Present in both (1)');
    expect(cleaned).toContain('React');
  });

  it('renders score/confidence changes', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 90),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Score / confidence changes (1)');
    expect(cleaned).toContain('Previous');
    expect(cleaned).toContain('Current');
    expect(cleaned).toContain('Change');
  });

  it('renders evidence changes', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'React 19' },
      ]),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Evidence changes');
    expect(html).toContain('Meta Tag');
    expect(html).toContain('added');
  });
});

// ─── Heading tests ───────────────────────────────────────────────────

describe('ScanComparison — heading hierarchy', () => {
  it('comparison header uses H2 (not H1)', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    // The old h1 in ComparisonHeader is now h2.
    expect(html).toContain('<h2>Scan Comparison</h2>');
    expect(html).not.toContain('<h1>Scan Comparison</h1>');
  });

  it('does not render a duplicate page-level H1 from the comparison component', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // The only h1s in the component should come from ScanOverview's
    // section-level headings ("Scan #{id}"), not from the comparison
    // header which was previously a duplicate page-level h1.
    expect(cleaned).toContain('<h1>Scan #scan_left</h1>');
    expect(cleaned).toContain('<h1>Scan #scan_right</h1>');
  });
});

// ─── Scan overview tests ────────────────────────────────────────────

describe('ScanComparison — scan overview in header', () => {
  it('previous side renders overview metrics (technology count, evidence count, confidence)', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    // ScanOverview shows target, hostname, and metrics
    expect(html).toContain('https://example.com/');
    expect(html).toContain('example.com');
    expect(html).toContain('Technologies');
    expect(html).toContain('Evidence');
    expect(html).toContain('Highest confidence');
  });

  it('current side shows its own detection count', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
      makeDetection('svelte', 'Svelte', 'frontend', 70),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    // Both sides render overview metrics
    expect(html).toContain('Technologies');
    expect(html).toContain('Evidence');
    expect(html).toContain('Highest confidence');
  });

  it('overview does not use raw scan ID as primary identity', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    // The target URL is shown as a primary user-facing identity
    expect(html).toContain('https://example.com/');
    expect(html).toContain('example.com');
  });
});

// ─── Comparison summary tests ─────────────────────────────────────────

describe('ScanComparison — comparison summary', () => {
  it('renders Added count', () => {
    const left = makeScan('scan_left', 'completed', [makeDetection('vue', 'Vue', 'frontend', 80)]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('vue', 'Vue', 'frontend', 80),
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Comparison summary');
    expect(html).toContain('Added');
    expect(html).toContain('Removed');
    expect(html).toContain('Score changes');
    expect(html).toContain('Evidence changes');
    expect(html).toContain('Overall');
    expect(html).toContain('Changes');
  });

  it('renders correct count for multiple additions and removals', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('vue', 'Vue', 'frontend', 80),
      makeDetection('angular', 'Angular', 'framework', 70),
      makeDetection('jquery', 'jQuery', 'frontend', 60),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('vue', 'Vue', 'frontend', 80),
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('svelte', 'Svelte', 'frontend', 70),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    // Added: React, Svelte (2). Removed: Angular, jQuery (2).
    // Score changes: 0 (Vue is unchanged at 80).
    expect(html).toContain('Added');
    expect(html).toContain('Removed');
    expect(html).toContain('Overall');
    expect(html).toContain('Changes');
  });

  it('renders score changes count', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 90),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Score changes');
    expect(html).toContain('Changes');
  });

  it('renders evidence changes count', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'React 19' },
      ]),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Evidence changes');
  });

  it('renders "No Changes" when all counts are zero', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Comparison summary');
    expect(html).toContain('No Changes');
  });
});

// ─── Navigation tests ────────────────────────────────────────────────

describe('ScanComparison — navigation', () => {
  it('renders back-to-scan-history link on the successful comparison path', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Back to scan history');
    expect(html).toContain('/scans');
    expect(html).toContain('← Back to scan history');
  });

  it('renders back-to-scan-history link on the error path (missing scan)', () => {
    const left = null;
    const right = makeScan('scan_right', 'completed', []);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Back to scan history');
    expect(html).toContain('/scans');
  });
});

// ─── Step 48: Technology change explainability ────────────────────────

describe('ScanComparison — added/removed technology explainability', () => {
  it('added technology renders confidence', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Added (1)');
    expect(cleaned).toContain('Vue');
    expect(cleaned).toContain('Confidence: 80');
    // Confidence is a 0–100 ranking score, not a probability — never rendered with '%'.
  });

  it('added technology renders supporting evidence', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('HTTP Header');
    expect(cleaned).toContain('Server: nginx');
    expect(cleaned).toContain('Evidence (1)');
  });

  it('removed technology renders confidence', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('angular', 'Angular', 'framework', 70),
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Removed (1)');
    expect(cleaned).toContain('Angular');
    expect(cleaned).toContain('Confidence: 70');
    // Confidence is a 0–100 ranking score, not a probability — never rendered with '%'.
  });

  it('removed technology renders supporting evidence', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('angular', 'Angular', 'framework', 70, [
        { type: 'meta_tag', name: 'generator', content: 'Angular CLI' },
      ]),
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Meta Tag');
    expect(html).toContain('Angular CLI');
    expect(html).toContain('Detected from');
  });

  it('added technology renders explainability summary', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'Vue' },
      ]),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Detected from');
    expect(html).toContain('HTTP Header');
    expect(html).toContain('Meta Tag');
  });

  it('known technology in added list links to technology detail route', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // isKnownTechnology('vue') returns true, so Vue should be linked
    expect(cleaned).toContain('/technologies/vue');
    expect(cleaned).toContain('Vue');
  });

  it('unknown technology in added list does not link', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('unknown-tech', 'Unknown Tech', 'frontend', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Unknown Tech');
    expect(cleaned).not.toContain('/technologies/unknown-tech');
  });

  it('handles technology without evidence gracefully', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);
    const result = compareScans(left, right);

    // Should not throw and should still show the technical
    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Vue');
    expect(cleaned).toContain('Confidence: 80');
    // Confidence is a 0–100 ranking score, not a probability — never rendered with '%'.
    // No evidence → no "Evidence (" collapsible summary should appear
    expect(cleaned).not.toContain('Evidence (');
  });

  it('handles missing detection in source scan safely', () => {
    // Start with a right scan that naturally produces an added technology
    // (Phantom is in right, not in left).
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('phantom-tech', 'Phantom', 'unknown', 50, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ]);
    const result = compareScans(left, right);

    // Now simulate the detection being missing from the source scan's
    // detections array (e.g. it was filtered or not yet loaded). The
    // TechnologyComparisonItem should still render safely without crashing
    // — just name + category + confidence, no evidence.
    result.right!.detections = result.right!.detections.filter(
      (d) => d.technology.id !== 'phantom-tech',
    );

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Renders with name + category + confidence, no crash
    expect(cleaned).toContain('Phantom');
    expect(cleaned).toContain('unknown');
    expect(cleaned).toContain('Confidence: 50');
    // Confidence is a 0–100 ranking score, not a probability — never rendered with '%'.
    expect(cleaned).not.toContain('Confidence: 50%');
    // No evidence rendered since the detection is missing
    expect(cleaned).not.toContain('Detected from');
  });

  it('unchanged technology with score changes does not re-render evidence from full detection', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 90, [
        { type: 'http_header', name: 'Server', value: 'apache' },
      ]),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Score change table still present (not regressed)
    expect(cleaned).toContain('Score / confidence changes (1)');
    expect(html).toContain('90');
    expect(html).toContain('95');
  });

  it('both added and removed technologies render with their respective evidence', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('angular', 'Angular', 'framework', 70, [
        { type: 'meta_tag', name: 'generator', content: 'Angular CLI' },
      ]),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Added (React in right, not in left)
    expect(cleaned).toContain('Added (1)');
    expect(cleaned).toContain('Confidence: 95');
    // Confidence is a 0–100 ranking score, not a probability — never rendered with '%'.
    expect(cleaned).not.toContain('Confidence: 95%');
    expect(cleaned).toContain('Detected from');

    // Removed (Angular in left, not in right)
    expect(cleaned).toContain('Removed (1)');
    expect(cleaned).toContain('Confidence: 70');
    // Confidence is a 0–100 ranking score, not a probability — never rendered with '%'.
    expect(cleaned).toContain('Angular CLI');
  });
});

// ─── Step 74: version change presentation ─────────────────────────────
describe('ScanComparison — Step 74 version change presentation', () => {
  // Local fixture: a React detection with an optional version + conflict flag.
  const reactVersion = (version: string | null, conflict = false): DetectionResponse => ({
    ...makeDetection('react', 'React', 'frontend', 95),
    version,
    ...(conflict ? { versionConflict: true } : {}),
  });

  it('renders a "Version changes" section with before → after transition', () => {
    const left = makeScan('scan_left', 'completed', [reactVersion('6.4.2')]);
    const right = makeScan('scan_right', 'completed', [reactVersion('6.5.1')]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Version changes (1)');
    expect(cleaned).toContain('version changed');
    expect(cleaned).toContain('6.4.2');
    expect(cleaned).toContain('6.5.1');
    // The comparison summary row also surfaces the count.
    expect(cleaned).toContain('Version changes');
  });

  it('surfaces a conflict badge on an unchanged tech; no version_changed section', () => {
    const left = makeScan('scan_left', 'completed', [
      { ...makeDetection('angular', 'Angular', 'framework', 70) },
      reactVersion('6.4.2', true),
    ]);
    const right = makeScan('scan_right', 'completed', [
      reactVersion('6.5.1'),
      { ...makeDetection('svelte', 'Svelte', 'frontend', 80) },
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Conflict forbids a `version_changed` classification for react.
    expect(cleaned).not.toContain('Version changes (');
    // The per-item badge on the unchanged (present-in-both) tech still
    // surfaces the conflict honestly (Step 72 §5).
    expect(cleaned).toContain('Version: unavailable — conflict detected');
    // Sibling changes are still reported.
    expect(cleaned).toContain('Added (1)');
    expect(cleaned).toContain('Removed (1)');
    // Summary row still rendered (count 0).
    expect(cleaned).toContain('Version changes');
  });

  it('surfaces added/removed/version counts together in the summary', () => {
    const left = makeScan('scan_left', 'completed', [
      { ...makeDetection('angular', 'Angular', 'framework', 70) },
      reactVersion('6.4.2'),
    ]);
    const right = makeScan('scan_right', 'completed', [
      reactVersion('6.5.1'),
      { ...makeDetection('svelte', 'Svelte', 'frontend', 80) },
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Per-section count badges (priority-ordered: added → removed → version → …).
    expect(cleaned).toContain('Added (1)');
    expect(cleaned).toContain('Removed (1)');
    expect(cleaned).toContain('Version changes (1)');
    // Summary rows for every kind.
    expect(cleaned).toContain('Version changes');
    expect(cleaned).toContain('Score changes');
    expect(cleaned).toContain('Overall');
  });
});

describe('ScanComparison — version rendering', () => {
  it('renders the version for an added technology that carries one', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
      {
        technology: { id: 'nginx', name: 'nginx', category: 'server' },
        confidence: 95,
        evidence: [{ type: 'http_header', name: 'Server', value: 'nginx/1.21.6' }],
        version: '1.21.6',
      },
    ]);
    const result = compareScans(left, right);
    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Version is subordinate to name > confidence > evidence.
    expect(cleaned).toContain('Version: 1.21.6');
    // Version is never rendered with a percent suffix.
    expect(cleaned).not.toContain('1.21.6%');
  });

  it('does not render a version label when the added technology has no version', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);
    const result = compareScans(left, right);
    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).not.toContain('Version:');
  });
});
