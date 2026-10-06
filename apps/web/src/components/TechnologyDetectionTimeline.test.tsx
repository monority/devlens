/**
 * Unit tests for the `TechnologyDetectionTimeline` pure presentation component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment required,
 * consistent with the existing node-based test setup. `next/link` is mocked to
 * render a plain `<a>` tag so the scan-detail links can be asserted as `href`
 * attributes without a router context.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TechnologyDetectionTimeline } from './TechnologyDetectionTimeline.js';
import type { TechnologyDetectionHistoryEntry } from '@/lib/technology-detection-history.js';

// Mock next/link to render a plain <a> tag (no router context needed).
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// ─── Test fixtures ───────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<TechnologyDetectionHistoryEntry> = {},
): TechnologyDetectionHistoryEntry {
  return {
    scanId: 'scan_001',
    scanCreatedAt: '2025-06-01T12:00:00.000Z',
    scanCompletedAt: '2025-06-01T12:00:05.000Z',
    scanStatus: 'completed',
    scanHostname: 'example.com',
    confidence: 80,
    version: null,
    versionConflict: false,
    evidenceCount: 1,
    signalQuality: {
      level: 'single_signal',
      evidenceCount: 1,
      sourceCount: 1,
      sources: ['header'],
      corroborated: false,
    },
    source: 'direct',
    integrity: null,
    ...overrides,
  };
}

// ─── Render helper ───────────────────────────────────────────────────

/**
 * Renders TechnologyDetectionTimeline to an HTML string in one call.
 * Returns both the raw HTML and the React-comment-stripped `cleaned`
 * version (the `<!-- -->/g` replace is needed when asserting on text
 * content). Collapses the repeated `renderToString + html.replace`
 * boilerplate across all 21 tests in this file.
 */
function renderTimeline(entries: TechnologyDetectionHistoryEntry[]) {
  const html = renderToString(<TechnologyDetectionTimeline entries={entries} />);
  return { html, cleaned: html.replace(/<!-- -->/g, '') };
}

// ─── 1. Empty state ─────────────────────────────────────────────────

describe('TechnologyDetectionTimeline — empty state', () => {
  it('renders nothing when there are no entries', () => {
    const { html } = renderTimeline([]);
    expect(html).toBe('');
  });
});

// ─── 2. Populated state ─────────────────────────────────────────────

describe('TechnologyDetectionTimeline — populated state', () => {
  it('renders the heading and a single row for one entry', () => {
    const { cleaned } = renderTimeline([makeEntry()]);
    expect(cleaned).toContain('Detection history');
    expect(cleaned).toContain('Completed');
  });

  it('renders one data row per entry (multi-row)', () => {
    const { cleaned } = renderTimeline([
      makeEntry({ scanId: 'scan_a' }),
      makeEntry({ scanId: 'scan_b' }),
    ]);
    expect(cleaned).toContain('/scans/scan_a');
    expect(cleaned).toContain('/scans/scan_b');
  });
});

// ─── 3. Scan link ───────────────────────────────────────────────────

describe('TechnologyDetectionTimeline — scan link', () => {
  it('links each row to the scan detail page', () => {
    const { html } = renderTimeline([makeEntry({ scanId: 'abc123' })]);
    expect(html).toContain('href="/scans/abc123"');
  });

  it('renders the creation timestamp as a time element', () => {
    const { html } = renderTimeline([makeEntry({ scanId: 'scan_001' })]);
    expect(html).toContain('dateTime="2025-06-01T12:00:00.000Z"');
  });

  it('renders the terminal (completed) timestamp', () => {
    const { html } = renderTimeline([makeEntry()]);
    expect(html).toContain('dateTime="2025-06-01T12:00:05.000Z"');
  });
});

// ─── 3b. Scan context (Step 91 §6) ───────────────────────────────────
// The timeline row must identify "what scan am I looking at" by surfacing the
// scan target hostname (the site). This is contextual text — NOT a link, since
// the scan date already links to /scans/{scanId} (§8: no duplicate navigation).

describe('TechnologyDetectionTimeline — scan context', () => {
  it('renders the scan target hostname alongside the scan date', () => {
    const { html } = renderTimeline([makeEntry({ scanHostname: 'app.example.com' })]);
    expect(html).toContain('app.example.com');
  });

  it('preserves exactly one scan link and leaves the date link text unchanged', () => {
    const { cleaned } = renderTimeline([
      makeEntry({ scanId: 'abc123', scanHostname: 'app.example.com' }),
    ]);
    // Only the scan date navigates to /scans/abc123 — the hostname is plain
    // text context, so there is no duplicate navigation element (§8/§10).
    expect(cleaned.match(/href="\/scans\/abc123"/g)).toHaveLength(1);
    expect(cleaned).toContain('Jun 1, 2025 at 12:00 UTC');
    expect(cleaned).toContain('app.example.com');
  });

  it('renders a distinct hostname for each row (multi-row)', () => {
    const { html } = renderTimeline([
      makeEntry({ scanId: 'scan_a', scanHostname: 'a.example.com' }),
      makeEntry({ scanId: 'scan_b', scanHostname: 'b.example.com' }),
    ]);
    expect(html).toContain('a.example.com');
    expect(html).toContain('b.example.com');
  });
});

// ─── 4. Field rendering ─────────────────────────────────────────────

describe('TechnologyDetectionTimeline — field rendering', () => {
  it('renders confidence exactly', () => {
    const { html } = renderTimeline([makeEntry({ confidence: 87 })]);
    expect(html).toContain('87');
  });

  it('renders a resolved version verbatim with its source', () => {
    const { cleaned } = renderTimeline([
      makeEntry({ version: '1.21.0', versionSource: 'http_header' }),
    ]);
    expect(cleaned).toContain('1.21.0');
    expect(cleaned).toContain('http_header');
  });

  it('renders "Conflict" for a version conflict (version nullified)', () => {
    const { cleaned } = renderTimeline([makeEntry({ version: null, versionConflict: true })]);
    expect(cleaned).toContain('Conflict');
  });

  it('renders an em/dash for an absent version', () => {
    const { cleaned } = renderTimeline([makeEntry()]);
    expect(cleaned).toContain('—');
  });

  it('renders the deduplicated evidence count and provenance evidence types', () => {
    const { cleaned } = renderTimeline([
      makeEntry({
        evidenceCount: 2,
        provenance: {
          evidenceCount: 2,
          evidenceTypes: ['http_header', 'meta_tag'],
          strongestEvidenceType: 'http_header',
        },
      }),
    ]);
    expect(cleaned).toContain('2');
    expect(cleaned).toContain('HTTP Header');
    expect(cleaned).toContain('Meta Tag');
  });

  it('renders signal quality for a direct detection', () => {
    const { cleaned } = renderTimeline([makeEntry()]);
    expect(cleaned).toContain('Single signal');
    expect(cleaned).toContain('1 source');
  });

  it('renders "Direct" for a directly-observed detection', () => {
    const { html } = renderTimeline([makeEntry({ source: 'direct' })]);
    expect(html).toContain('Direct');
  });

  it('renders "Derived" + source technologies for a relationship-derived detection', () => {
    const { cleaned } = renderTimeline([
      makeEntry({
        source: 'relationship',
        derivedFrom: [{ source: 'react', sourceName: 'React', type: 'implies' }],
      }),
    ]);
    expect(cleaned).toContain('Derived');
    expect(cleaned).toContain('from React');
  });

  it('renders "Valid" when integrity is absent (null)', () => {
    const { html } = renderTimeline([makeEntry({ integrity: null })]);
    expect(html).toContain('Valid');
  });

  it('renders "Invalid" + canonical issue labels when integrity is present', () => {
    const { cleaned } = renderTimeline([
      makeEntry({
        integrity: { valid: false, issues: ['DUPLICATE_EVIDENCE', 'PROVENANCE_MISMATCH'] },
      }),
    ]);
    expect(cleaned).toContain('Invalid');
    expect(cleaned).toContain('Duplicate evidence');
    expect(cleaned).toContain('Provenance mismatch');
  });

  it('shows the "Completed" status badge', () => {
    const { html } = renderTimeline([makeEntry()]);
    expect(html).toContain('Completed');
  });
});

// ─── 5. Existing content intact ──────────────────────────────────────

describe('TechnologyDetectionTimeline — structure', () => {
  it('renders a section with aria-label and a table', () => {
    const { cleaned } = renderTimeline([makeEntry()]);
    expect(cleaned).toContain('aria-label="Detection history"');
    expect(cleaned).toContain('table');
  });

  it('renders the column headers', () => {
    const { cleaned } = renderTimeline([makeEntry()]);
    expect(cleaned).toContain('Confidence');
    expect(cleaned).toContain('Version');
    expect(cleaned).toContain('Evidence');
    expect(cleaned).toContain('Signal quality');
    expect(cleaned).toContain('Provenance');
    expect(cleaned).toContain('Integrity');
    expect(cleaned).toContain('Status');
  });
});
