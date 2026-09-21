/**
 * Unit tests for the ResultQualitySummary component (Step 79).
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment —
 * matching the ObservationCoverageSummary.test.tsx convention.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ResultQualitySummary } from './ResultQualitySummary.js';
import { EMPTY_SCAN_RESULT_QUALITY, type ScanResultQualitySummary } from '@devlens/core';

function summary(overrides: Partial<ScanResultQualitySummary> = {}): ScanResultQualitySummary {
  return { ...EMPTY_SCAN_RESULT_QUALITY, ...overrides };
}

describe('ResultQualitySummary', () => {
  it('§6 well-supported scan renders the verdict and detection counts, no warning', () => {
    const rq = summary({
      quality: 'well_supported',
      detectionCount: 12,
      directDetectionCount: 8,
      derivedDetectionCount: 4,
      corroboratedDetectionCount: 7,
      singleSignalDetectionCount: 5,
      hasPartialObservation: false,
    });
    const html = renderToString(React.createElement(ResultQualitySummary, { resultQuality: rq }));
    expect(html).toContain('Result quality');
    expect(html).toContain('>Well supported<');
    expect(html).toContain('12 detections · 8 direct · 4 derived');
    expect(html).toContain('7 corroborated · 5 single-signal');
    expect(html).not.toContain('could not be inspected');
  });

  it('§6 partially-observed scan reuses the gray §14 incomplete warning', () => {
    const rq = summary({
      quality: 'partially_observed',
      detectionCount: 3,
      directDetectionCount: 2,
      derivedDetectionCount: 1,
      corroboratedDetectionCount: 1,
      singleSignalDetectionCount: 2,
      versionConflictCount: 1,
      failedObservationCount: 1,
      hasPartialObservation: true,
    });
    const html = renderToString(React.createElement(ResultQualitySummary, { resultQuality: rq }));
    expect(html).toContain('>Partially observed<');
    expect(html).toContain('3 detections · 2 direct · 1 derived');
    expect(html).toContain('1 version conflict');
    expect(html).toContain('1 failed observation');
    expect(html).toContain(
      'Some resources could not be inspected, so the result may be incomplete.',
    );
  });

  it('§6 limited-observation scan renders the limited verdict and a single-signal line', () => {
    const rq = summary({
      quality: 'limited_observation',
      detectionCount: 1,
      directDetectionCount: 1,
      singleSignalDetectionCount: 1,
      hasPartialObservation: false,
    });
    const html = renderToString(React.createElement(ResultQualitySummary, { resultQuality: rq }));
    expect(html).toContain('>Limited observation<');
    expect(html).toContain('1 detection');
    expect(html).toContain('1 single-signal');
    expect(html).not.toContain('could not be inspected');
  });

  it('§8 no-observations (zero detections) renders the context line and defers the warning', () => {
    const rq = summary({
      quality: 'no_observations',
      detectionCount: 0,
      hasPartialObservation: true,
      failedObservationCount: 2,
    });
    const html = renderToString(React.createElement(ResultQualitySummary, { resultQuality: rq }));
    expect(html).toContain('>No observations<');
    expect(html).toContain('Nothing was observable to support a detection.');
    // §8: blind-spot warning is owned by EmptyDetections, not this section.
    expect(html).not.toContain('could not be inspected');
  });

  it('§6 omits zero-count dimensions (no derived, no single-signal, no version/failed/skipped)', () => {
    const rq = summary({
      quality: 'well_supported',
      detectionCount: 5,
      directDetectionCount: 5,
      derivedDetectionCount: 0,
      corroboratedDetectionCount: 5,
      singleSignalDetectionCount: 0,
      versionConflictCount: 0,
      failedObservationCount: 0,
      skippedObservationCount: 0,
      hasPartialObservation: false,
    });
    const html = renderToString(React.createElement(ResultQualitySummary, { resultQuality: rq }));
    expect(html).toContain('5 detections · 5 direct');
    expect(html).not.toContain('derived');
    expect(html).toContain('5 corroborated');
    expect(html).not.toContain('single-signal');
    expect(html).not.toContain('version conflict');
    expect(html).not.toContain('failed observation');
    expect(html).not.toContain('skipped observation');
  });

  it('§6 pluralizes "detection" / "version conflict" and "observation"', () => {
    const one = renderToString(
      React.createElement(ResultQualitySummary, {
        resultQuality: summary({
          quality: 'well_supported',
          detectionCount: 1,
          directDetectionCount: 1,
          versionConflictCount: 1,
          failedObservationCount: 1,
          corroboratedDetectionCount: 1,
        }),
      }),
    );
    expect(one).toContain('1 detection');
    expect(one).toContain('1 version conflict');
    expect(one).toContain('1 failed observation');

    const two = renderToString(
      React.createElement(ResultQualitySummary, {
        resultQuality: summary({
          quality: 'partially_observed',
          detectionCount: 2,
          directDetectionCount: 2,
          versionConflictCount: 2,
          skippedObservationCount: 2,
          hasPartialObservation: true,
        }),
      }),
    );
    expect(two).toContain('2 detections');
    expect(two).toContain('2 version conflicts');
    expect(two).toContain('2 skipped observations');
  });

  it('§6 renders the incomplete warning only when hasPartialObservation and detections exist', () => {
    const withWarning = renderToString(
      React.createElement(ResultQualitySummary, {
        resultQuality: summary({
          quality: 'partially_observed',
          detectionCount: 2,
          directDetectionCount: 2,
          hasPartialObservation: true,
          skippedObservationCount: 1,
        }),
      }),
    );
    expect(withWarning).toContain('could not be inspected');

    const withoutWarning = renderToString(
      React.createElement(ResultQualitySummary, {
        resultQuality: summary({
          quality: 'well_supported',
          detectionCount: 2,
          directDetectionCount: 2,
          hasPartialObservation: false,
        }),
      }),
    );
    expect(withoutWarning).not.toContain('could not be inspected');
  });

  it('§13 is icon-free and uses the gray CSS-module palette', () => {
    const html = renderToString(
      React.createElement(ResultQualitySummary, {
        resultQuality: summary({
          quality: 'well_supported',
          detectionCount: 1,
          directDetectionCount: 1,
          corroboratedDetectionCount: 1,
          hasPartialObservation: true,
        }),
      }),
    );
    expect(html).not.toMatch(/<svg/);
    expect(html).toContain('class=');
  });

  it('§6 the EMPTY_SCAN_RESULT_QUALITY default renders no-observations context', () => {
    const html = renderToString(
      React.createElement(ResultQualitySummary, { resultQuality: EMPTY_SCAN_RESULT_QUALITY }),
    );
    expect(html).toContain('>No observations<');
    expect(html).toContain('Nothing was observable to support a detection.');
    expect(html).not.toContain('could not be inspected');
  });
});
