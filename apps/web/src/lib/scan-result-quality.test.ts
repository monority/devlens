import { describe, it, expect } from 'vitest';
import {
  EMPTY_SCAN_RESULT_QUALITY,
  type ObservationCoverage,
  type ObservationCoverageSource,
  type ObservationCoverageStatus,
  type ObservationFamily,
  type ScanResultQuality,
} from '@devlens/core';
import type {
  DetectionResponse,
  SignalQualityLevel,
  DetectionExplainability,
} from '../lib/types.js';
import { getScanResultQuality } from './scan-result-quality';

// ─── Fixtures ────────────────────────────────────────────────────────

const FAMILIES: ReadonlyArray<ObservationFamily> = [
  'header',
  'meta',
  'content',
  'script_url',
  'link',
  'resource_url',
  'resource_content',
];

const SURFACE_STATUSES: ObservationCoverageStatus[] = [
  'observed',
  'partial',
  'failed',
  'skipped',
  'not_observed',
];

/** Surface counts are derived directly from `statusCounts` so the aggregate
 * `failed`/`skipped`/`fetched` counts never drift from the surface statuses.
 * Remaining surface slots become `not_observed`. */
function makeCoverage(
  statusCounts: Partial<Record<ObservationCoverageStatus, number>>,
): ObservationCoverage {
  const statuses: ObservationCoverageStatus[] = [];
  for (const s of SURFACE_STATUSES) {
    for (let i = 0; i < (statusCounts[s] ?? 0); i++) statuses.push(s);
  }
  while (statuses.length < FAMILIES.length) statuses.push('not_observed');

  const sources: ObservationCoverageSource[] = FAMILIES.map((family, i) => ({
    family,
    status: statuses[i] ?? 'not_observed',
    fetched: 0,
    failed: 0,
    skipped: 0,
  }));

  return {
    discovered: statuses.length,
    selected: 0,
    fetched: statuses.filter((s) => s === 'observed' || s === 'partial').length,
    failed: statuses.filter((s) => s === 'failed').length,
    skipped: statuses.filter((s) => s === 'skipped').length,
    sources,
  };
}

const SQ = {
  noEvidence: { level: 'no_evidence' as SignalQualityLevel, sourceCount: 0, corroborated: false },
  single: { level: 'single_signal' as SignalQualityLevel, sourceCount: 1, corroborated: false },
  corroborated: { level: 'corroborated' as SignalQualityLevel, sourceCount: 2, corroborated: true },
  strong: { level: 'strong' as SignalQualityLevel, sourceCount: 3, corroborated: true },
};

/** A minimal-but-valid `DetectionExplainability` carrying a signal quality. */
function makeExplanation(
  isDerived: boolean,
  confidence: number,
  name: string,
  category: string,
  signalQuality?: { level: SignalQualityLevel; sourceCount: number; corroborated: boolean },
): DetectionExplainability {
  return {
    technology: { name, category },
    kind: isDerived ? 'derived' : 'direct',
    confidence,
    summary: '',
    reasons: [],
    evidenceCount: 0,
    evidenceTypes: [],
    evidenceSources: [],
    evidence: [],
    noDirectEvidence: isDerived,
    ...(signalQuality
      ? {
          signalQuality: {
            level: signalQuality.level,
            evidenceCount: 0,
            sourceCount: signalQuality.sourceCount,
            sources: [],
            corroborated: signalQuality.corroborated,
          },
        }
      : {}),
  };
}

/**
 * Builds a `DetectionResponse` fixture. The signal quality is set EXPLICITLY
 * (proving reuse — §9.I): `getScanResultQuality` must read this value, never
 * recompute it from the (empty here) evidence.
 */
function makeDetection(opts: {
  id?: string;
  name?: string;
  category?: string;
  confidence?: number;
  source?: 'direct' | 'relationship';
  versionConflict?: boolean;
  signalQuality?: { level: SignalQualityLevel; sourceCount: number; corroborated: boolean };
}): DetectionResponse {
  const isDerived = opts.source === 'relationship';
  const confidence = opts.confidence ?? 50;
  const name = opts.name ?? 'Tech';
  const category = opts.category ?? 'cms';

  return {
    technology: { id: opts.id ?? 't-1', name, category },
    confidence,
    evidence: [],
    ...(opts.source ? { source: opts.source } : {}),
    ...(opts.versionConflict ? { versionConflict: true } : {}),
    explanation: makeExplanation(isDerived, confidence, name, category, opts.signalQuality),
  };
}

const mkDirect = (sq: { level: SignalQualityLevel; sourceCount: number; corroborated: boolean }) =>
  makeDetection({ signalQuality: sq });
const mkDerived = () =>
  makeDetection({
    source: 'relationship',
    signalQuality: SQ.noEvidence,
  });

// ─── Tests ───────────────────────────────────────────────────────────

describe('getScanResultQuality', () => {
  describe('A — fully observed scan', () => {
    it('classifies well_supported with correct counts and mixed signal quality', () => {
      const detections = [
        mkDerived(),
        mkDirect(SQ.single),
        mkDirect(SQ.corroborated),
        mkDirect(SQ.strong),
      ];
      const coverage = makeCoverage({ observed: 7 });
      const summary = getScanResultQuality({ detections, observationCoverage: coverage });

      expect(summary.quality).toBe('well_supported');
      expect(summary.detectionCount).toBe(4);
      expect(summary.directDetectionCount).toBe(3);
      expect(summary.derivedDetectionCount).toBe(1);
      expect(summary.corroboratedDetectionCount).toBe(2); // corroborated + strong
      expect(summary.singleSignalDetectionCount).toBe(1);
      expect(summary.noEvidenceDetectionCount).toBe(1); // the derived detection
      expect(summary.versionConflictCount).toBe(0);
      expect(summary.failedObservationCount).toBe(0);
      expect(summary.skippedObservationCount).toBe(0);
      expect(summary.hasPartialObservation).toBe(false);
    });
  });

  describe('B — partially observed scan', () => {
    it('classifies partially_observed when some surfaces failed/skipped', () => {
      const detections = [mkDirect(SQ.corroborated), mkDirect(SQ.strong)];
      const coverage = makeCoverage({ observed: 5, failed: 1, skipped: 1 });
      const summary = getScanResultQuality({ detections, observationCoverage: coverage });

      expect(summary.quality).toBe('partially_observed');
      expect(summary.detectionCount).toBe(2);
      expect(summary.failedObservationCount).toBe(1);
      expect(summary.skippedObservationCount).toBe(1);
      expect(summary.hasPartialObservation).toBe(true);
    });

    it('classifies limited_observation when failures/skips outnumber fetched', () => {
      const detections = [mkDirect(SQ.corroborated)];
      const coverage = makeCoverage({ observed: 2, failed: 3, skipped: 2 });
      const summary = getScanResultQuality({ detections, observationCoverage: coverage });

      expect(summary.quality).toBe('limited_observation');
      expect(summary.failedObservationCount).toBe(3);
      expect(summary.skippedObservationCount).toBe(2);
      expect(summary.hasPartialObservation).toBe(true);
    });
  });

  describe('C — skipped-only observations', () => {
    it('keeps skipped distinguishable from failed (skipped ≠ failed)', () => {
      const detections = [mkDirect(SQ.corroborated)];
      const coverage = makeCoverage({ observed: 6, skipped: 1 }); // no failed
      const summary = getScanResultQuality({ detections, observationCoverage: coverage });

      expect(summary.quality).toBe('partially_observed');
      expect(summary.failedObservationCount).toBe(0);
      expect(summary.skippedObservationCount).toBe(1);
      expect(summary.hasPartialObservation).toBe(true);
    });
  });

  describe('D — failed-only observations', () => {
    it('keeps failed distinguishable from skipped (failed ≠ skipped)', () => {
      const detections = [mkDirect(SQ.corroborated)];
      const coverage = makeCoverage({ observed: 6, failed: 1 }); // no skipped
      const summary = getScanResultQuality({ detections, observationCoverage: coverage });

      expect(summary.quality).toBe('partially_observed');
      expect(summary.failedObservationCount).toBe(1);
      expect(summary.skippedObservationCount).toBe(0);
    });
  });

  describe('E — no detections', () => {
    it('zero counts and no_observations when coverage is absent', async () => {
      const summary = getScanResultQuality({ detections: [] });

      expect(summary.quality).toBe('no_observations');
      expect(summary.detectionCount).toBe(0);
      expect(summary.directDetectionCount).toBe(0);
      expect(summary.derivedDetectionCount).toBe(0);
      expect(summary.corroboratedDetectionCount).toBe(0);
      expect(summary.singleSignalDetectionCount).toBe(0);
      expect(summary.noEvidenceDetectionCount).toBe(0);
      expect(summary.versionConflictCount).toBe(0);
      expect(summary.failedObservationCount).toBe(0);
      expect(summary.skippedObservationCount).toBe(0);
      expect(summary.hasPartialObservation).toBe(false);
      expect(summary).toEqual(EMPTY_SCAN_RESULT_QUALITY);
    });

    it('remains no_observations even with failed/skipped surfaces (no detections)', () => {
      const summary = getScanResultQuality({
        detections: [],
        observationCoverage: makeCoverage({ observed: 3, failed: 2, skipped: 1 }),
      });

      expect(summary.quality).toBe('no_observations');
      expect(summary.detectionCount).toBe(0);
      expect(summary.failedObservationCount).toBe(2);
      expect(summary.skippedObservationCount).toBe(1);
      expect(summary.hasPartialObservation).toBe(true);
    });
  });

  describe('F — version conflicts', () => {
    it('counts existing version conflicts without inventing any', () => {
      const detections = [
        makeDetection({ versionConflict: true, signalQuality: SQ.corroborated }),
        makeDetection({ versionConflict: true, signalQuality: SQ.single }),
        makeDetection({ signalQuality: SQ.strong }),
      ];
      const summary = getScanResultQuality({
        detections,
        observationCoverage: makeCoverage({ observed: 7 }),
      });

      expect(summary.versionConflictCount).toBe(2);
      expect(summary.detectionCount).toBe(3);
    });
  });

  describe('G — direct vs relationship-derived detections', () => {
    it('splits direct and derived counts', () => {
      const detections = [
        mkDerived(),
        mkDerived(),
        mkDirect(SQ.corroborated),
        mkDirect(SQ.single),
        mkDirect(SQ.strong),
      ];
      const summary = getScanResultQuality({
        detections,
        observationCoverage: makeCoverage({ observed: 7 }),
      });

      expect(summary.detectionCount).toBe(5);
      expect(summary.directDetectionCount).toBe(3);
      expect(summary.derivedDetectionCount).toBe(2);
      expect(summary.noEvidenceDetectionCount).toBe(2);
    });
  });

  describe('H — deterministic ordering', () => {
    it('is invariant to detection permutation', () => {
      const a = mkDirect(SQ.strong);
      const b = mkDerived();
      const c = mkDirect(SQ.single);
      const coverage = makeCoverage({ observed: 5, failed: 1, skipped: 1 });

      const base = getScanResultQuality({ detections: [a, b, c], observationCoverage: coverage });
      const permuted = getScanResultQuality({
        detections: [c, b, a],
        observationCoverage: coverage,
      });
      const shuffled = getScanResultQuality({
        detections: [b, a, c],
        observationCoverage: makeCoverage({ observed: 5, failed: 1, skipped: 1 }),
      });

      expect(permuted).toEqual(base);
      expect(shuffled).toEqual(base);
    });
  });

  describe('I — signal quality is reused, not recomputed', () => {
    it('counts the explicit signalQuality levels verbatim', () => {
      // Evidence array is empty, but signalQuality is explicitly 'single_signal'
      // — the function must count it as single-signal, proving it reads the
      // pre-computed explainability rather than recomputing from evidence.
      const detections = [mkDirect(SQ.single)];
      const summary = getScanResultQuality({
        detections,
        observationCoverage: makeCoverage({ observed: 7 }),
      });

      expect(summary.singleSignalDetectionCount).toBe(1);
      expect(summary.corroboratedDetectionCount).toBe(0);
      expect(summary.noEvidenceDetectionCount).toBe(0);
    });
  });

  describe('J — regression / contract', () => {
    it('quality is always one of the documented categorical values', () => {
      const labels: ScanResultQuality[] = [
        'well_supported',
        'partially_observed',
        'limited_observation',
        'no_observations',
      ];
      const summary = getScanResultQuality({
        detections: [mkDirect(SQ.corroborated)],
        observationCoverage: makeCoverage({ observed: 7 }),
      });
      expect(labels).toContain(summary.quality);
    });
  });
});
