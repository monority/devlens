/**
 * Unit tests for EmptyDetections (Step 78 §13 / §15).
 *
 * Verifies the tightened zero-detection wording plus the conditional
 * blind-spot warning (§14): shown only when the snapshot's observation
 * coverage reports failed/skipped resources.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { EmptyDetections } from './EmptyDetections.js';
import type { ObservationCoverage } from '@devlens/core';

function coverage(overrides: Partial<ObservationCoverage> = {}): ObservationCoverage {
  return {
    discovered: 0,
    selected: 0,
    fetched: 0,
    failed: 0,
    skipped: 0,
    sources: [],
    ...overrides,
  };
}

describe('EmptyDetections', () => {
  describe('§15 Case A (0 detections, no un-inspected resources)', () => {
    it('renders improved wording and NO blind-spot warning', () => {
      const html = renderToString(
        React.createElement(EmptyDetections, { observationCoverage: coverage() }),
      );
      expect(html).toContain('Detections (0)');
      expect(html).toContain('The scan completed successfully');
      expect(html).toContain('No observable technologies were detected.');
      expect(html).not.toContain('could not be inspected');
    });
  });

  describe('§15 Case B (0 detections, 2 skipped resources)', () => {
    it('renders improved wording AND the blind-spot warning', () => {
      const html = renderToString(
        React.createElement(EmptyDetections, {
          observationCoverage: coverage({ skipped: 2 }),
        }),
      );
      expect(html).toContain('No observable technologies were detected.');
      expect(html).toContain(
        'Some resources could not be inspected, so the result may be incomplete.',
      );
    });
  });

  it('suppresses the warning when coverage is absent', () => {
    const html = renderToString(React.createElement(EmptyDetections, {}));
    expect(html).toContain('No observable technologies were detected.');
    expect(html).not.toContain('could not be inspected');
  });
});
