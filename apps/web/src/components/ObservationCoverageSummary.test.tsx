/**
 * Unit tests for the ObservationCoverageSummary component (Step 78).
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment —
 * matching the EvidenceList.test.tsx convention.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ObservationCoverageSummary } from './ObservationCoverageSummary.js';
import type {
  ObservationCoverage,
  ObservationCoverageSource,
  ObservationCoverageStatus,
  ObservationFamily,
} from '@devlens/core';

const FAMILIES: ReadonlyArray<ObservationFamily> = [
  'header',
  'meta',
  'content',
  'script_url',
  'link',
  'resource_url',
  'resource_content',
];

function src(
  family: ObservationFamily,
  status: ObservationCoverageStatus,
  extra: Partial<ObservationCoverageSource> = {},
): ObservationCoverageSource {
  return { family, status, fetched: 0, failed: 0, skipped: 0, ...extra };
}

function coverage(sources: ObservationCoverageSource[]): ObservationCoverage {
  let fetched = 0;
  let failed = 0;
  let skipped = 0;
  for (const s of sources) {
    fetched += s.fetched;
    failed += s.failed;
    skipped += s.skipped;
  }
  return {
    discovered: 0,
    selected: 0,
    fetched,
    failed,
    skipped,
    sources,
  };
}

const ALL_OBSERVED = FAMILIES.map((family) => src(family, 'observed'));

describe('ObservationCoverageSummary', () => {
  it('§12 renders the full §4 family matrix with an Observability heading', () => {
    const html = renderToString(
      React.createElement(ObservationCoverageSummary, { coverage: coverage(ALL_OBSERVED) }),
    );
    expect(html).toContain('Observability');
    expect(html).toContain('HTTP headers');
    expect(html).toContain('Meta tags');
    expect(html).toContain('Script content');
    expect(html).toContain('Script URLs');
    expect(html).toContain('Link tags');
    expect(html).toContain('Resource URLs');
    expect(html).toContain('Resource content');
    expect(html).toContain('>observed<');
  });

  it('§14 omits the partial-warning when coverage is complete', () => {
    const html = renderToString(
      React.createElement(ObservationCoverageSummary, { coverage: coverage(ALL_OBSERVED) }),
    );
    expect(html).not.toContain('could not be inspected');
  });

  it('§14 renders the gray partial-warning when a resource surface is skipped', () => {
    const sources = FAMILIES.map((family) =>
      family === 'resource_content'
        ? src(family, 'skipped', { skipped: 1 })
        : src(family, 'observed'),
    );
    const html = renderToString(
      React.createElement(ObservationCoverageSummary, { coverage: coverage(sources) }),
    );
    expect(html).toContain(
      'Some resources could not be inspected, so the result may be incomplete.',
    );
  });

  it('§14 renders the warning when a resource surface is partial or failed', () => {
    const sources = FAMILIES.map((family) => {
      if (family === 'resource_url') return src(family, 'partial', { fetched: 1, failed: 1 });
      if (family === 'resource_content') return src(family, 'failed', { failed: 1 });
      return src(family, 'observed');
    });
    const html = renderToString(
      React.createElement(ObservationCoverageSummary, { coverage: coverage(sources) }),
    );
    expect(html).toContain('could not be inspected');
  });

  it('renders "not observed" for surfaces that were not present', () => {
    const sources = FAMILIES.map((family) => src(family, 'not_observed'));
    const html = renderToString(
      React.createElement(ObservationCoverageSummary, { coverage: coverage(sources) }),
    );
    expect(html).toContain('>not observed<');
    expect(html).not.toContain('could not be inspected');
  });

  it('§13 keeps status text lowercase (no aggressive casing/icons/badges)', () => {
    const sources = FAMILIES.map((family) =>
      family === 'resource_url' ? src(family, 'partial') : src(family, 'observed'),
    );
    const html = renderToString(
      React.createElement(ObservationCoverageSummary, { coverage: coverage(sources) }),
    );
    expect(html).toContain('>partial<');
    expect(html).not.toMatch(/<svg/);
  });
});
