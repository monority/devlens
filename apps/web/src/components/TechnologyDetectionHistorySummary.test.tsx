/**
 * Render tests for TechnologyDetectionHistorySummary (Step 89 §8 UI).
 *
 * The component is pure presentation (no `next/link`, no client hooks), so it
 * can be exercised directly with `renderToString` exactly like the sibling
 * `TechnologyDetectionTimeline` tests.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TechnologyDetectionHistorySummary } from '@/components/TechnologyDetectionHistorySummary';
import type { TechnologyDetectionHistorySummary as HistorySummary } from '@/lib/technology-detection-history-summary.js';

const EARLIER = '2025-06-01T10:00:00.000Z';
const NOW = '2025-06-01T12:00:05.000Z';

function makeSummary(overrides: Partial<HistorySummary> = {}): HistorySummary {
  return {
    scanCount: 2,
    firstDetectedAt: EARLIER,
    lastDetectedAt: NOW,
    confidence: 85,
    confidenceChanged: false,
    versionChanged: false,
    provenanceChanged: false,
    integrityChanged: false,
    signalQualityChanged: false,
    stability: 'stable',
    ...overrides,
  };
}

const render = (summary: HistorySummary | null) =>
  renderToString(React.createElement(TechnologyDetectionHistorySummary, { summary })).replace(
    /<!-- -->/g,
    '',
  );

describe('TechnologyDetectionHistorySummary', () => {
  it('renders nothing when the summary is null (no history)', () => {
    expect(render(null)).toBe('');
  });

  it('renders the scan count', () => {
    expect(render(makeSummary({ scanCount: 3 }))).toContain('>3<');
  });

  it('renders the latest confidence exactly', () => {
    const html = render(makeSummary({ confidence: 87 }));
    expect(html).toContain('>87<');
  });

  it('renders first/last detected as <time> with formatted text', () => {
    const html = render(makeSummary({ firstDetectedAt: EARLIER, lastDetectedAt: NOW }));
    expect(html).toContain('<time dateTime="2025-06-01T10:00:00.000Z">');
    expect(html).toContain('<time dateTime="2025-06-01T12:00:05.000Z">');
    expect(html).toContain('Jun');
    expect(html).toContain('2025');
  });

  it('falls back to — when first/last detected are null', () => {
    const html = render(makeSummary({ firstDetectedAt: null, lastDetectedAt: null }));
    // Two "—" cells (first + last).
    expect(html.match(/—/g) ?? []).toHaveLength(2);
  });

  it('renders the indeterminate state for a single observation', () => {
    const html = render(makeSummary({ scanCount: 1, stability: 'indeterminate' }));
    expect(html).toContain('Indeterminate');
  });

  it('renders the stable state with all change indicators as Unchanged', () => {
    const html = render(makeSummary({ scanCount: 2, stability: 'stable' }));
    expect(html).toContain('Stable');
    expect(html).toContain('Version');
    expect(html).toContain('Provenance');
    expect(html).toContain('Integrity');
    expect(html).toContain('Signal quality');
    // Count text nodes only — CSS-module class names (e.g.
    // `indicatorUnchanged_<hash>`) also contain these tokens, so strip classes.
    const textOnly = html.replace(/\sclass="[^"]*"/g, '');
    expect(textOnly.match(/Unchanged/g) ?? []).toHaveLength(4);
    expect(textOnly).not.toContain('Changed');
  });

  it('renders the changed state with the changed dimension marked Changed', () => {
    const html = render(
      makeSummary({
        scanCount: 2,
        stability: 'changed',
        versionChanged: true,
        provenanceChanged: false,
        integrityChanged: false,
        signalQualityChanged: false,
        confidenceChanged: true, // drives stability but is not an indicator row
      }),
    );
    const textOnly = html.replace(/\sclass="[^"]*"/g, '');
    expect(textOnly).toContain('Changed');
    // Only the Version indicator changed; the other three remain Unchanged.
    expect(textOnly.match(/Unchanged/g) ?? []).toHaveLength(3);
  });

  it('exposes status text to assistive tech (not color-only)', () => {
    const html = render(makeSummary({ stability: 'changed', versionChanged: true }));
    expect(html).toContain('Stability');
    expect(html).toContain('Changed');
    expect(html).toContain('Unchanged');
  });

  it('uses semantic HTML with a labelled region', () => {
    const html = render(makeSummary());
    expect(html).toContain('aria-labelledby="detection-history-summary-title"');
    expect(html).toContain('id="detection-history-summary-title"');
    expect(html).toContain('<section');
    expect(html).toContain('<h2');
    expect(html).toContain('<dl');
  });
});
