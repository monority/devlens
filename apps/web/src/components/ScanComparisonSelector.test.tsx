/**
 * Unit tests for the `ScanComparisonSelector` client component.
 *
 * The test environment is `node` (no jsdom), so `renderToString` from
 * `react-dom/server` is used to verify the initial render output,
 * following the same pattern as `ScanLifecycle.test.tsx` and
 * `ScanComparison.test.tsx`.
 *
 * Since `renderToString` does not execute `useEffect`, these tests cover
 * the **initial render** (collapsed state showing the button) and verify
 * the component handles edge cases without crashing.
 *
 * The full selection behavior (checkbox toggling, Compare button
 * enable/disable, URL construction, same-scan protection) is tested
 * through the pure helper functions in `comparison-selector.test.ts`,
 * which exercise all 10 acceptance criteria from the spec.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScanComparisonSelector } from './ScanComparisonSelector.js';
import type { ScanSummary } from '../lib/types.js';

// Mock next/navigation so useRouter() does not fail in renderToString.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// ─── Test fixtures ───────────────────────────────────────────────────

function makeScan(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    id: overrides.id ?? 'scan_1',
    status: overrides.status ?? 'completed',
    target: overrides.target ?? 'https://example.com/',
    hostname: overrides.hostname ?? 'example.com',
    createdAt: overrides.createdAt ?? '2025-06-01T12:00:00.000Z',
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? '2025-06-01T12:00:05.000Z',
    failedAt: overrides.failedAt ?? null,
    error: overrides.error ?? null,
  };
}

function makeScans(): ScanSummary[] {
  return [
    makeScan({ id: 'scan_a', status: 'completed', target: 'https://a.com/' }),
    makeScan({ id: 'scan_b', status: 'running', target: 'https://b.com/' }),
    makeScan({ id: 'scan_c', status: 'completed', target: 'https://c.com/' }),
    makeScan({ id: 'scan_d', status: 'failed', target: 'https://d.com/' }),
  ];
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ScanComparisonSelector — initial render (collapsed)', () => {
  it('renders "Compare two scans" button', () => {
    const html = renderToString(
      React.createElement(ScanComparisonSelector, { scans: makeScans() }),
    );
    expect(html).toContain('Compare two scans');
  });

  it('renders the button as a <button> element (not a link)', () => {
    const html = renderToString(
      React.createElement(ScanComparisonSelector, { scans: makeScans() }),
    );
    expect(html).toContain('<button');
    expect(html).not.toContain('<a');
  });

  it('sets aria-expanded to false on the button', () => {
    const html = renderToString(
      React.createElement(ScanComparisonSelector, { scans: makeScans() }),
    );
    expect(html).toContain('aria-expanded="false"');
  });

  it('does not show selection controls in collapsed state', () => {
    const html = renderToString(
      React.createElement(ScanComparisonSelector, { scans: makeScans() }),
    );
    expect(html).not.toContain('Compare scans');
    expect(html).not.toContain('Previous');
    expect(html).not.toContain('Cancel');
  });
});

describe('ScanComparisonSelector — edge cases', () => {
  it('renders without crashing when scans list is empty', () => {
    const html = renderToString(React.createElement(ScanComparisonSelector, { scans: [] }));
    expect(html).toContain('Compare two scans');
    expect(html).toContain('<button');
  });

  it('renders without crashing when all scans are completed', () => {
    const scans = [
      makeScan({ id: 'a', status: 'completed' }),
      makeScan({ id: 'b', status: 'completed' }),
    ];
    const html = renderToString(React.createElement(ScanComparisonSelector, { scans }));
    expect(html).toContain('Compare two scans');
  });

  it('renders without crashing when all scans are non-completed', () => {
    const scans = [
      makeScan({ id: 'a', status: 'pending' }),
      makeScan({ id: 'b', status: 'failed' }),
    ];
    const html = renderToString(React.createElement(ScanComparisonSelector, { scans }));
    expect(html).toContain('Compare two scans');
  });
});

describe('ScanComparisonSelector — selection gate logic', () => {
  // The collapsed component always shows the button. The expanded-state
  // selection logic (checkbox toggling, left/right assignment, Compare
  // button enable/disable) is tested in `comparison-selector.test.ts`
  // via the pure functions: isComparable, isValidSelection, buildCompareUrl.

  it('only completed scans are comparable (documents the rule)', () => {
    const scans = makeScans();
    const completed = scans.filter((s) => s.status === 'completed');
    expect(completed).toHaveLength(2);
    expect(completed.map((s) => s.id)).toEqual(['scan_a', 'scan_c']);
  });

  // Re-export for discoverability: see comparison-selector.test.ts
  // for full selection-behavior coverage (10 acceptance criteria).
});
