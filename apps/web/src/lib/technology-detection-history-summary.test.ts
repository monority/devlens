/**
 * Unit tests for the Step 89 `technologyDetectionHistorySummary` transformer.
 *
 * These exercise the pure comparison/normalization logic against hand-built
 * `TechnologyDetectionHistoryEntry` fixtures (mirroring what the Step 88
 * transformer emits). They do NOT depend on React, a database, or the network.
 */

import { describe, it, expect } from 'vitest';
import type { TechnologyDetectionHistoryEntry } from '@/lib/technology-detection-history.js';
import { technologyDetectionHistorySummary } from '@/lib/technology-detection-history-summary.js';
import type { DetectionIntegrity, DetectionProvenance } from '@devlens/core';
import type { SignalQuality } from '@/lib/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────

const DEFAULT_SQ: SignalQuality = {
  level: 'single_signal' as const,
  evidenceCount: 1,
  sourceCount: 1,
  sources: ['header' as const],
  corroborated: false,
};

interface EntryInput {
  scanId?: string;
  scanCreatedAt?: string;
  scanCompletedAt?: string;
  confidence?: number;
  version?: string | null;
  versionConflict?: boolean;
  evidenceCount?: number;
  signalQuality?: SignalQuality;
  source?: 'direct' | 'relationship';
  provenance?: DetectionProvenance;
  derivedFrom?: readonly { source: string; sourceName: string; type: 'implies' }[];
  integrity?: DetectionIntegrity | null;
}

const SAME_TIME = '2025-06-01T12:00:05.000Z';

function makeEntry(i: EntryInput): TechnologyDetectionHistoryEntry {
  const base = {
    scanId: i.scanId ?? 'scan-1',
    scanCreatedAt: i.scanCreatedAt ?? SAME_TIME,
    scanCompletedAt: i.scanCompletedAt ?? SAME_TIME,
    scanStatus: 'completed' as const,
    confidence: i.confidence ?? 90,
    version: i.version ?? null,
    versionConflict: i.versionConflict ?? false,
    evidenceCount: i.evidenceCount ?? 1,
    signalQuality: i.signalQuality ?? DEFAULT_SQ,
    source: i.source ?? 'direct',
    integrity: i.integrity ?? null,
  };
  if (i.provenance === undefined && i.derivedFrom === undefined) {
    return base;
  }
  return {
    ...base,
    ...(i.provenance ? { provenance: i.provenance } : undefined),
    ...(i.derivedFrom ? { derivedFrom: i.derivedFrom } : undefined),
  };
}

const DIRECT_PROVENANCE: DetectionProvenance = {
  evidenceCount: 1,
  evidenceTypes: ['http_header'],
  strongestEvidenceType: 'http_header',
};

describe('technologyDetectionHistorySummary', () => {
  // ── Empty ────────────────────────────────────────────────────────
  describe('empty history', () => {
    it('returns null (summary absent)', () => {
      expect(technologyDetectionHistorySummary([])).toBeNull();
    });
  });

  // ── Single observation ───────────────────────────────────────────
  describe('single observation', () => {
    const summary = () => technologyDetectionHistorySummary([makeEntry({ confidence: 85 })])!;

    it('reports scan count of 1', () => {
      expect(summary().scanCount).toBe(1);
    });

    it('sets first/last detected to the single scan timestamp', () => {
      const s = technologyDetectionHistorySummary([
        makeEntry({ confidence: 85, scanCreatedAt: '2025-06-01T12:00:05.000Z' }),
      ])!;
      expect(s.firstDetectedAt).toBe('2025-06-01T12:00:05.000Z');
      expect(s.lastDetectedAt).toBe('2025-06-01T12:00:05.000Z');
    });

    it('uses the single confidence as latest', () => {
      expect(summary().confidence).toBe(85);
    });

    it('stability is indeterminate', () => {
      expect(summary().stability).toBe('indeterminate');
    });

    it('sets no change flags (no consecutive pair)', () => {
      const s = summary();
      expect(s.confidenceChanged).toBe(false);
      expect(s.versionChanged).toBe(false);
      expect(s.provenanceChanged).toBe(false);
      expect(s.integrityChanged).toBe(false);
      expect(s.signalQualityChanged).toBe(false);
    });
  });

  // ── Stable history ───────────────────────────────────────────────
  describe('stable history', () => {
    it('returns stable with all change flags false for equivalent observations', () => {
      const history = [
        makeEntry({ scanId: 'scan-2', scanCreatedAt: '2025-06-02T12:00:05.000Z', confidence: 85 }),
        makeEntry({ scanId: 'scan-1', scanCreatedAt: '2025-06-01T12:00:05.000Z', confidence: 85 }),
      ];
      const s = technologyDetectionHistorySummary(history)!;
      expect(s.stability).toBe('stable');
      expect(s.confidenceChanged).toBe(false);
      expect(s.versionChanged).toBe(false);
      expect(s.provenanceChanged).toBe(false);
      expect(s.integrityChanged).toBe(false);
      expect(s.signalQualityChanged).toBe(false);
    });
  });

  // ── Confidence ────────────────────────────────────────────────────
  describe('confidence', () => {
    it('flags confidence change with exact comparison', () => {
      const history = [
        makeEntry({ scanId: 'b', scanCreatedAt: '2025-06-02T00:00:00.000Z', confidence: 80 }),
        makeEntry({ scanId: 'a', scanCreatedAt: '2025-06-01T00:00:00.000Z', confidence: 85 }),
      ];
      const s = technologyDetectionHistorySummary(history)!;
      expect(s.confidenceChanged).toBe(true);
      expect(s.stability).toBe('changed');
    });

    it('flags no change when confidence is unchanged', () => {
      const history = [
        makeEntry({ scanId: 'b', scanCreatedAt: '2025-06-02T00:00:00.000Z', confidence: 80 }),
        makeEntry({ scanId: 'a', scanCreatedAt: '2025-06-01T00:00:00.000Z', confidence: 80 }),
      ];
      const s = technologyDetectionHistorySummary(history)!;
      expect(s.confidenceChanged).toBe(false);
    });

    it('preserves exact (including fractional) confidence — no rounding', () => {
      const history = [
        makeEntry({ scanId: 'b', scanCreatedAt: '2025-06-02T00:00:00.000Z', confidence: 80.5 }),
        makeEntry({ scanId: 'a', scanCreatedAt: '2025-06-01T00:00:00.000Z', confidence: 80.6 }),
      ];
      const s = technologyDetectionHistorySummary(history)!;
      expect(s.confidence).toBe(80.5); // latest preserved exactly
      expect(s.confidenceChanged).toBe(true);
    });
  });

  // ── Version ──────────────────────────────────────────────────────
  describe('version', () => {
    it('flags a version change', () => {
      const history = [
        makeEntry({ scanId: 'b', scanCreatedAt: '2025-06-02T00:00:00.000Z', version: '2.0' }),
        makeEntry({ scanId: 'a', scanCreatedAt: '2025-06-01T00:00:00.000Z', version: '1.0' }),
      ];
      expect(technologyDetectionHistorySummary(history)!.versionChanged).toBe(true);
    });

    it('does not flag when the version is unchanged', () => {
      const history = [
        makeEntry({ scanId: 'b', scanCreatedAt: '2025-06-02T00:00:00.000Z', version: '1.0' }),
        makeEntry({ scanId: 'a', scanCreatedAt: '2025-06-01T00:00:00.000Z', version: '1.0' }),
      ];
      expect(technologyDetectionHistorySummary(history)!.versionChanged).toBe(false);
    });

    it('does not treat a resolved→conflict transition as a version change (conflict forbids transition, Step 72 / comparison §74)', () => {
      // A `versionConflict` on either side forbids a version transition — the
      // consensus is refused, so a resolved version → conflict (normalized to
      // `null`) is NOT reported as a version change. This mirrors
      // `computeVersionChange` in `comparison.ts` so history-summary stability
      // agrees with scan comparison.
      const history = [
        // newest: version conflict → entry.version normalized to null
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          version: null,
          versionConflict: true,
        }),
        // oldest: resolved version
        makeEntry({ scanId: 'a', scanCreatedAt: '2025-06-01T00:00:00.000Z', version: '1.0' }),
      ];
      expect(technologyDetectionHistorySummary(history)!.versionChanged).toBe(false);
    });

    it('does not treat a conflict→resolved transition as a version change (conflict on either side)', () => {
      const history = [
        // newest: resolved version
        makeEntry({ scanId: 'b', scanCreatedAt: '2025-06-02T00:00:00.000Z', version: '1.0' }),
        // oldest: version conflict → entry.version normalized to null
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          version: null,
          versionConflict: true,
        }),
      ];
      expect(technologyDetectionHistorySummary(history)!.versionChanged).toBe(false);
    });

    it('does not flag a change when both observations are version conflicts (both normalized to null)', () => {
      const history = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          version: null,
          versionConflict: true,
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          version: null,
          versionConflict: true,
        }),
      ];
      expect(technologyDetectionHistorySummary(history)!.versionChanged).toBe(false);
    });
  });

  // ── Provenance ───────────────────────────────────────────────────
  describe('provenance', () => {
    it('direct → direct (same) does not flag a change', () => {
      const history = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 90,
          provenance: DIRECT_PROVENANCE,
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          provenance: DIRECT_PROVENANCE,
        }),
      ];
      expect(technologyDetectionHistorySummary(history)!.provenanceChanged).toBe(false);
    });

    it('direct → derived flags a change (provenance present → absent)', () => {
      const history = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 90,
          provenance: DIRECT_PROVENANCE,
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          source: 'relationship',
          derivedFrom: [{ source: 'react', sourceName: 'React', type: 'implies' }],
        }),
      ];
      expect(technologyDetectionHistorySummary(history)!.provenanceChanged).toBe(true);
    });

    it('derived → direct flags a change (provenance absent → present)', () => {
      const history = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 90,
          provenance: DIRECT_PROVENANCE,
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          source: 'relationship',
          derivedFrom: [{ source: 'react', sourceName: 'React', type: 'implies' }],
        }),
      ].reverse(); // oldest first now is derived→direct
      expect(technologyDetectionHistorySummary(history)!.provenanceChanged).toBe(true);
    });

    it('flags a change when provenance evidence count differs', () => {
      const history = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 90,
          provenance: DIRECT_PROVENANCE,
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          provenance: {
            evidenceCount: 2,
            evidenceTypes: ['http_header', 'meta_tag'],
            strongestEvidenceType: 'meta_tag',
          },
        }),
      ];
      expect(technologyDetectionHistorySummary(history)!.provenanceChanged).toBe(true);
    });
  });

  // ── Integrity ────────────────────────────────────────────────────
  describe('integrity', () => {
    const DUPLICATE: TechnologyDetectionHistoryEntry['integrity'] = {
      valid: false,
      issues: ['DUPLICATE_EVIDENCE'],
    };
    const PROVENANCE: TechnologyDetectionHistoryEntry['integrity'] = {
      valid: false,
      issues: ['PROVENANCE_MISMATCH'],
    };

    it('valid → valid does not flag a change', () => {
      // both null ⇒ valid
      const history = [
        makeEntry({ scanId: 'b', scanCreatedAt: '2025-06-02T00:00:00.000Z', confidence: 90 }),
        makeEntry({ scanId: 'a', scanCreatedAt: '2025-06-01T00:00:00.000Z', confidence: 90 }),
      ];
      expect(technologyDetectionHistorySummary(history)!.integrityChanged).toBe(false);
    });

    it('valid → invalid flags a change', () => {
      const history = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 90,
          integrity: DUPLICATE,
        }),
        makeEntry({ scanId: 'a', scanCreatedAt: '2025-06-01T00:00:00.000Z', confidence: 90 }),
      ];
      expect(technologyDetectionHistorySummary(history)!.integrityChanged).toBe(true);
    });

    it('invalid → valid flags a change', () => {
      const history = [
        makeEntry({ scanId: 'b', scanCreatedAt: '2025-06-02T00:00:00.000Z', confidence: 90 }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          integrity: DUPLICATE,
        }),
      ];
      expect(technologyDetectionHistorySummary(history)!.integrityChanged).toBe(true);
    });

    it('different canonical issue sets flag a change', () => {
      const history = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 90,
          integrity: DUPLICATE,
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          integrity: PROVENANCE,
        }),
      ];
      expect(technologyDetectionHistorySummary(history)!.integrityChanged).toBe(true);
    });

    it('does not flag a change from issue reordering (canonicalized)', () => {
      // Same issue set, different raw order ⇒ canonical sort ⇒ no false change.
      const history = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 90,
          integrity: { valid: false, issues: ['DUPLICATE_EVIDENCE', 'PROVENANCE_MISMATCH'] },
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          integrity: { valid: false, issues: ['PROVENANCE_MISMATCH', 'DUPLICATE_EVIDENCE'] },
        }),
      ];
      expect(technologyDetectionHistorySummary(history)!.integrityChanged).toBe(false);
    });
  });

  // ── Signal quality ───────────────────────────────────────────────
  describe('signal quality', () => {
    function sq(level: SignalQuality['level'], sourceCount: number): SignalQuality {
      return {
        level,
        evidenceCount: sourceCount,
        sourceCount,
        sources: [],
        corroborated: sourceCount >= 2,
      };
    }

    it('does not flag a change for equal quality', () => {
      const history = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 90,
          signalQuality: sq('single_signal', 1),
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          signalQuality: sq('single_signal', 1),
        }),
      ];
      expect(technologyDetectionHistorySummary(history)!.signalQualityChanged).toBe(false);
    });

    it('flags a change for differing quality', () => {
      const history = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 90,
          signalQuality: sq('single_signal', 1),
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          signalQuality: sq('corroborated', 2),
        }),
      ];
      expect(technologyDetectionHistorySummary(history)!.signalQualityChanged).toBe(true);
    });
  });

  // ── Multiple dimensions ──────────────────────────────────────────
  describe('multiple dimensions', () => {
    it('stable when all dimensions are equal across 3 observations', () => {
      const history = [
        makeEntry({
          scanId: 'c',
          scanCreatedAt: '2025-06-03T00:00:00.000Z',
          confidence: 90,
          version: '1.0',
          provenance: DIRECT_PROVENANCE,
        }),
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 90,
          version: '1.0',
          provenance: DIRECT_PROVENANCE,
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          version: '1.0',
          provenance: DIRECT_PROVENANCE,
        }),
      ];
      const s = technologyDetectionHistorySummary(history)!;
      expect(s.stability).toBe('stable');
      expect(s.confidenceChanged).toBe(false);
      expect(s.versionChanged).toBe(false);
      expect(s.provenanceChanged).toBe(false);
    });

    it('changed when multiple dimensions change', () => {
      const history = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 85,
          version: '2.0',
          provenance: DIRECT_PROVENANCE,
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          version: '1.0',
          provenance: DIRECT_PROVENANCE,
        }),
      ];
      const s = technologyDetectionHistorySummary(history)!;
      expect(s.stability).toBe('changed');
      expect(s.confidenceChanged).toBe(true);
      expect(s.versionChanged).toBe(true);
    });

    it('changed when only one dimension changes', () => {
      const history = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 91,
          version: '1.0',
          provenance: DIRECT_PROVENANCE,
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          version: '1.0',
          provenance: DIRECT_PROVENANCE,
        }),
      ];
      const s = technologyDetectionHistorySummary(history)!;
      expect(s.stability).toBe('changed');
      expect(s.confidenceChanged).toBe(true);
      expect(s.versionChanged).toBe(false);
      expect(s.provenanceChanged).toBe(false);
      expect(s.integrityChanged).toBe(false);
      expect(s.signalQualityChanged).toBe(false);
    });
  });

  // ── Ordering ─────────────────────────────────────────────────────
  describe('ordering', () => {
    it('consumes history newest-first: first = oldest, last = newest', () => {
      const history: TechnologyDetectionHistoryEntry[] = [
        // newest first (as the Step 88 transformer emits)
        makeEntry({
          scanId: 'scan-newest',
          scanCreatedAt: '2025-06-03T00:00:00.000Z',
          confidence: 85,
        }),
        makeEntry({
          scanId: 'scan-middle',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 85,
        }),
        makeEntry({
          scanId: 'scan-oldest',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 85,
        }),
      ];
      const s = technologyDetectionHistorySummary(history)!;
      expect(s.firstDetectedAt).toBe('2025-06-01T00:00:00.000Z');
      expect(s.lastDetectedAt).toBe('2025-06-03T00:00:00.000Z');
      expect(s.scanCount).toBe(3);
    });

    it('tie-break by scan id remains deterministic (equal timestamps, stable content)', () => {
      // Two entries with identical timestamp (tie) and identical observations.
      const history = [
        makeEntry({ scanId: 'scan-b', scanCreatedAt: SAME_TIME, confidence: 85, version: '1.0' }),
        makeEntry({ scanId: 'scan-a', scanCreatedAt: SAME_TIME, confidence: 85, version: '1.0' }),
      ];
      const s = technologyDetectionHistorySummary(history)!;
      expect(s.stability).toBe('stable');
      expect(s.firstDetectedAt).toBe(SAME_TIME);
      expect(s.lastDetectedAt).toBe(SAME_TIME);
    });
  });

  // ── Immutability ─────────────────────────────────────────────────
  describe('immutability', () => {
    it('does not mutate the input array, its elements, or nested issues', () => {
      const integrity: DetectionIntegrity = {
        valid: false,
        issues: ['PROVENANCE_MISMATCH', 'DUPLICATE_EVIDENCE'],
      };
      const history: TechnologyDetectionHistoryEntry[] = [
        makeEntry({
          scanId: 'b',
          scanCreatedAt: '2025-06-02T00:00:00.000Z',
          confidence: 90,
          integrity,
        }),
        makeEntry({
          scanId: 'a',
          scanCreatedAt: '2025-06-01T00:00:00.000Z',
          confidence: 90,
          integrity,
        }),
      ];
      const issuesBefore = [...integrity.issues];
      const refsBefore = [...history];

      const s = technologyDetectionHistorySummary(history)!;

      expect(s.integrityChanged).toBe(false); // canonicalized ⇒ no change
      // input array length/order unchanged
      expect(history.length).toBe(refsBefore.length);
      // element references preserved (transformer reads, never rebuilds entries)
      expect(history[0]).toBe(refsBefore[0]);
      expect(history[1]).toBe(refsBefore[1]);
      // nested issues array untouched (canonical sort used a copy)
      expect(integrity.issues).toEqual(issuesBefore);
      expect(integrity.issues).toEqual(['PROVENANCE_MISMATCH', 'DUPLICATE_EVIDENCE']);
    });
  });
});
