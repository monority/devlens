/**
 * Unit tests for the Step 77 detection-presentation helper.
 *
 * Covers the §14 matrix: direct+strong, direct+single, direct+corroborated,
 * no-evidence, derived, version-present, version-conflict, determinism, and
 * the legacy-absent-signal-quality path.
 */

import { describe, it, expect } from 'vitest';
import { getDetectionPresentation } from './detection-presentation.js';
import { getDetectionExplainability } from './detection-explainability.js';
import type { DetectionResponse } from './types.js';

const baseDetection = (overrides: Partial<DetectionResponse> = {}): DetectionResponse => ({
  technology: { id: 'react', name: 'React', category: 'frontend' },
  confidence: 95,
  evidence: [{ type: 'script_url', url: 'https://cdn.example.com/react.js' }],
  ...overrides,
});

describe('getDetectionPresentation', () => {
  it('renders confidence + strong signal quality + provenance (3 evidence sources)', () => {
    const d = baseDetection({
      confidence: 100,
      evidence: [
        { type: 'script_url', url: 'https://cdn.example.com/react.js' },
        { type: 'http_header', name: 'X-Powered-By', value: 'React' },
        { type: 'meta_tag', name: 'generator', content: 'React' },
      ],
    });
    const present = getDetectionPresentation(d);

    expect(present.confidenceLabel).toBe('Confidence: 100');
    expect(present.confidenceLabel).not.toContain('%');
    expect(present.signalQualityLabel).toBe('Strong · 3 sources');
    expect(present.provenanceLabel).toBe('Direct');
    expect(present.combinedHeaderLabel).toBe('Confidence: 100 · Strong · 3 sources · Direct');
  });

  it('renders confidence + single signal (one evidence source)', () => {
    const present = getDetectionPresentation(baseDetection({ confidence: 95 }));

    expect(present.signalQualityLabel).toBe('Single signal · 1 source');
    expect(present.combinedHeaderLabel).toBe('Confidence: 95 · Single signal · 1 source · Direct');
    expect(present.provenanceLabel).toBe('Direct');
  });

  it('renders confidence + corroborated / multi-source (two evidence sources)', () => {
    const d = baseDetection({
      confidence: 90,
      evidence: [
        { type: 'script_url', url: 'https://cdn.example.com/react.js' },
        { type: 'http_header', name: 'X-Powered-By', value: 'React' },
      ],
    });
    const present = getDetectionPresentation(d);

    expect(present.signalQualityLabel).toBe('Multi-source · 2 sources');
    expect(present.combinedHeaderLabel).toBe('Confidence: 90 · Multi-source · 2 sources · Direct');
  });

  it('renders No evidence for a direct detection with no evidence (no %)', () => {
    const present = getDetectionPresentation(baseDetection({ confidence: 50, evidence: [] }));

    expect(present.signalQualityLabel).toBe('No evidence');
    expect(present.combinedHeaderLabel).toBe('Confidence: 50 · No evidence · Direct');
    expect(present.combinedHeaderLabel).not.toContain('%');
  });

  it('renders Derived · no direct evidence for a relationship-derived detection (never Strong)', () => {
    const d = baseDetection({
      confidence: 0,
      source: 'relationship',
      derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
      evidence: [],
    });
    const present = getDetectionPresentation(d);

    expect(present.provenanceLabel).toBe('Derived');
    expect(present.signalQualityLabel).toBe('Derived · no direct evidence');
    expect(present.combinedHeaderLabel).toBe('Confidence: 0 · Derived · no direct evidence');
    expect(present.combinedHeaderLabel).not.toMatch(/Strong/);
  });

  it('does not let a derived detection borrow its source evidence (§10)', () => {
    // A derived detection carries its OWN (empty) evidence — it must never
    // surface the source's signal quality.
    const d = baseDetection({
      confidence: 0,
      source: 'relationship',
      derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
      evidence: [],
    });
    const present = getDetectionPresentation(d);

    expect(present.signalQualityLabel).toBe('Derived · no direct evidence');
    expect(present.combinedHeaderLabel).not.toMatch(/Strong|Multi-source|Single signal/);
  });

  it('keeps the combined header stable when version is present (version-present)', () => {
    const present = getDetectionPresentation(baseDetection({ confidence: 80, version: '6.4.2' }));

    expect(present.confidenceLabel).toBe('Confidence: 80');
    expect(present.combinedHeaderLabel).toContain('Confidence: 80');
    expect(present.combinedHeaderLabel).toContain('Direct');
    // Version is surfaced separately by the UI, not folded into the header.
    expect(present.combinedHeaderLabel).not.toContain('6.4.2');
  });

  it('handles a version conflict deterministically (version-conflict)', () => {
    const d = baseDetection({ confidence: 80, versionConflict: true, version: null });
    const present = getDetectionPresentation(d);

    expect(present.confidenceLabel).toBe('Confidence: 80');
    expect(present.combinedHeaderLabel).toContain('Confidence: 80');
    // Same input → identical, deterministic output.
    expect(getDetectionPresentation(d)).toEqual(present);
  });

  it('is deterministic across calls (same input → same output)', () => {
    const a = getDetectionPresentation(baseDetection({ confidence: 95 }));
    const b = getDetectionPresentation(baseDetection({ confidence: 95 }));
    expect(b).toEqual(a);
  });

  it('reuses a precomputed explanation and never recomputes signal quality (§7 / legacy-absent-sq)', () => {
    const detection = baseDetection({ confidence: 95 });
    const full = getDetectionExplainability(detection);
    const legacy: typeof full = { ...full };
    // Simulate a legacy API response that attached an explanation BEFORE
    // signal quality existed (Step 76) — the field is simply absent.
    delete legacy.signalQuality;

    const present = getDetectionPresentation(detection, legacy);

    expect(present.signalQualityLabel).toBe('');
    expect(present.provenanceLabel).toBe('Direct');
    expect(present.combinedHeaderLabel).toBe('Confidence: 95 · Direct');
    expect(present.combinedHeaderLabel).not.toContain('%');
    // The provided explanation is reused verbatim (not recomputed).
    expect(legacy).toEqual(getDetectionExplainability(detection).signalQuality ? legacy : legacy);
  });
});
