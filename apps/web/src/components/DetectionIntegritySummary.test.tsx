/**
 * Unit tests for the DetectionIntegritySummary component (Step 86).
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment —
 * matching the ResultQualitySummary.test.tsx convention.
 *
 * Note: React 19's `renderToString` emits `<!-- -->` comment nodes around
 * interleaved numbers in JSX text. Tests that assert on numeric content
 * strip these via `.replace(/<!-- -->/g, '')` (the established convention
 * in this repo's component tests).
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DetectionIntegritySummary } from './DetectionIntegritySummary.js';
import type { ScanIntegritySummary } from '../lib/detection-integrity-presenter.js';
import {
  summarizeIntegrity,
  EMPTY_SCAN_INTEGRITY_SUMMARY,
} from '../lib/detection-integrity-presenter.js';
import type { DetectionResponse } from '../lib/types.js';

function makeDetection(integrity?: {
  valid: boolean;
  issues: readonly string[];
}): DetectionResponse {
  return {
    technology: { id: 'react', name: 'React', category: 'frontend' },
    confidence: 90,
    evidence: [{ type: 'script_url', url: 'https://example.com/react.js' }],
    ...(integrity ? { integrity } : {}),
  } as DetectionResponse;
}

function summaryFromDetections(detections: DetectionResponse[]): ScanIntegritySummary {
  return summarizeIntegrity(detections);
}

/** Strips React 19 `renderToString` comment nodes for text assertions. */
function strip(html: string): string {
  return html.replace(/<!-- -->/g, '');
}

describe('DetectionIntegritySummary', () => {
  it('renders nothing when there are no integrity issues', () => {
    const html = renderToString(
      React.createElement(DetectionIntegritySummary, {
        summary: EMPTY_SCAN_INTEGRITY_SUMMARY,
      }),
    );

    expect(strip(html)).toBe('');
  });

  it('renders nothing when all detections are clean (no integrity field)', () => {
    const summary = summaryFromDetections([makeDetection(), makeDetection()]);
    const html = renderToString(React.createElement(DetectionIntegritySummary, { summary }));

    expect(html).not.toContain('Detection integrity');
  });

  it('renders the summary when issues exist', () => {
    const summary = summaryFromDetections([
      makeDetection({ valid: false, issues: ['DUPLICATE_EVIDENCE'] }),
    ]);
    const html = renderToString(React.createElement(DetectionIntegritySummary, { summary }));
    const cleaned = strip(html);

    expect(cleaned).toContain('Detection integrity');
    expect(cleaned).toContain('1 detection with');
    expect(cleaned).toContain('1 issue');
    expect(cleaned).toContain('Duplicate evidence: 1');
  });

  it('renders the affected detection count', () => {
    const summary = summaryFromDetections([
      makeDetection({ valid: false, issues: ['DUPLICATE_EVIDENCE'] }),
      makeDetection({ valid: false, issues: ['EMPTY_EVIDENCE'] }),
      makeDetection(),
    ]);
    const html = renderToString(React.createElement(DetectionIntegritySummary, { summary }));
    const cleaned = strip(html);

    // 2 affected detections (out of 3), the clean one is not counted
    expect(cleaned).toContain('2 detections with');
  });

  it('renders issue labels and counts for each issue type', () => {
    const summary = summaryFromDetections([
      makeDetection({ valid: false, issues: ['DUPLICATE_EVIDENCE', 'EMPTY_EVIDENCE'] }),
      makeDetection({ valid: false, issues: ['EMPTY_EVIDENCE'] }),
    ]);
    const html = renderToString(React.createElement(DetectionIntegritySummary, { summary }));
    const cleaned = strip(html);

    // Duplicate evidence: count 1
    expect(cleaned).toContain('Duplicate evidence: 1');
    // Empty evidence: count 2
    expect(cleaned).toContain('Empty evidence: 2');
  });

  it('renders pluralized "detection" / "issue" correctly', () => {
    // Singular
    const one = summaryFromDetections([
      makeDetection({ valid: false, issues: ['DUPLICATE_EVIDENCE'] }),
    ]);
    const oneHtml = strip(
      renderToString(React.createElement(DetectionIntegritySummary, { summary: one })),
    );
    expect(oneHtml).toContain('1 detection with');
    expect(oneHtml).toContain('1 issue');

    // Plural
    const two = summaryFromDetections([
      makeDetection({ valid: false, issues: ['DUPLICATE_EVIDENCE'] }),
      makeDetection({ valid: false, issues: ['EMPTY_EVIDENCE'] }),
    ]);
    const twoHtml = strip(
      renderToString(React.createElement(DetectionIntegritySummary, { summary: two })),
    );
    expect(twoHtml).toContain('2 detections with');
    expect(twoHtml).toContain('2 issues');
  });

  it('preserves deterministic canonical ordering of issue rows', () => {
    // Input is deliberately reversed (later canonical issues first)
    const summary = summaryFromDetections([
      makeDetection({ valid: false, issues: ['EMPTY_EVIDENCE'] }),
      makeDetection({ valid: false, issues: ['PROVENANCE_MISMATCH'] }),
      makeDetection({ valid: false, issues: ['DUPLICATE_EVIDENCE'] }),
      makeDetection({ valid: false, issues: ['INVALID_EVIDENCE_TYPE'] }),
      makeDetection({ valid: false, issues: ['INVALID_DETECTION_IDENTITY'] }),
    ]);
    const html = renderToString(React.createElement(DetectionIntegritySummary, { summary }));

    // Canonical order: identity → evidence type → duplicate → provenance → empty
    const identityPos = html.indexOf('Invalid detection identity');
    const evidenceTypePos = html.indexOf('Invalid evidence type');
    const duplicatePos = html.indexOf('Duplicate evidence');
    const provenancePos = html.indexOf('Provenance mismatch');
    const emptyPos = html.indexOf('Empty evidence');

    expect(identityPos).toBeGreaterThan(-1);
    expect(evidenceTypePos).toBeGreaterThan(-1);
    expect(duplicatePos).toBeGreaterThan(-1);
    expect(provenancePos).toBeGreaterThan(-1);
    expect(emptyPos).toBeGreaterThan(-1);

    expect(identityPos).toBeLessThan(evidenceTypePos);
    expect(evidenceTypePos).toBeLessThan(duplicatePos);
    expect(duplicatePos).toBeLessThan(provenancePos);
    expect(provenancePos).toBeLessThan(emptyPos);
  });

  it('§13 renders no icons (icon-free)', () => {
    const summary = summaryFromDetections([
      makeDetection({ valid: false, issues: ['DUPLICATE_EVIDENCE'] }),
    ]);
    const html = renderToString(React.createElement(DetectionIntegritySummary, { summary }));

    expect(html).not.toMatch(/<svg/);
  });

  it('§8 uses a semantic <section> and <h2> heading', () => {
    const summary = summaryFromDetections([
      makeDetection({ valid: false, issues: ['DUPLICATE_EVIDENCE'] }),
    ]);
    const html = renderToString(React.createElement(DetectionIntegritySummary, { summary }));

    expect(html).toContain('>Detection integrity<');
    expect(html).toMatch(/<section/);
  });
});
