/**
 * Unit tests for the detection-integrity presenter (Step 86).
 *
 * Pure-logic tests (no React / renderToString): `summarizeIntegrity` is a
 * pure function over a readonly detections slice.
 */

import { describe, it, expect } from 'vitest';
import type { DetectionIntegrityIssue } from '@devlens/core';
import { INTEGRITY_ISSUE_ORDER } from '@devlens/core';
import type { DetectionResponse } from './types.js';
import {
  EMPTY_SCAN_INTEGRITY_SUMMARY,
  INTEGRITY_ISSUE_LABELS,
  summarizeIntegrity,
  integrityIssueLabel,
  integrityIssueDescription,
} from './detection-integrity-presenter.js';

/**
 * Minimal `DetectionResponse` fixture. `integrity` is opt-in (clean
 * detections omit it per the Step 81 contract).
 */
function makeDetection(overrides: Partial<DetectionResponse> = {}): DetectionResponse {
  return {
    technology: { id: 'react', name: 'React', category: 'frontend' },
    confidence: 90,
    evidence: [{ type: 'script_url', url: 'https://example.com/react.js' }],
    ...overrides,
  };
}

/** A detection carrying the given integrity issues (valid === false). */
function withIntegrity(issues: DetectionIntegrityIssue[]): DetectionResponse {
  return makeDetection({ integrity: { valid: false, issues } });
}

describe('integrityIssueLabel / integrityIssueDescription', () => {
  it('covers every canonical issue type from INTEGRITY_ISSUE_ORDER', () => {
    // Guards against the label map drifting out of sync with the taxonomy.
    expect(Object.keys(INTEGRITY_ISSUE_LABELS)).toEqual([...INTEGRITY_ISSUE_ORDER]);
    for (const issue of INTEGRITY_ISSUE_ORDER) {
      const label = integrityIssueLabel(issue);
      const description = integrityIssueDescription(issue);
      expect(label).toBeTruthy();
      expect(description).toBeTruthy();
      expect(label.length).toBeLessThanOrEqual(40);
    }
  });

  it('returns stable, distinct labels for each issue', () => {
    const labels = new Set(INTEGRITY_ISSUE_ORDER.map(integrityIssueLabel));
    expect(labels.size).toBe(INTEGRITY_ISSUE_ORDER.length);
  });

  it('returns the canonical label for a known issue', () => {
    expect(integrityIssueLabel('DUPLICATE_EVIDENCE')).toBe('Duplicate evidence');
    expect(integrityIssueLabel('EMPTY_EVIDENCE')).toBe('Empty evidence');
  });
});

describe('summarizeIntegrity', () => {
  it('returns the empty summary for no detections', () => {
    expect(summarizeIntegrity([])).toEqual(EMPTY_SCAN_INTEGRITY_SUMMARY);
  });

  it('returns the empty summary when all detections are clean', () => {
    const ds = [
      makeDetection(),
      makeDetection({ technology: { id: 'vue', name: 'Vue', category: 'frontend' } }),
    ];
    expect(summarizeIntegrity(ds).affectedDetectionCount).toBe(0);
    expect(summarizeIntegrity(ds).totalIssues).toBe(0);
    expect(summarizeIntegrity(ds).issueCounts).toEqual([]);
  });

  it('ignores a valid-but-present integrity verdict (defensive, non-contract)', () => {
    // Contract: integrity is present only when valid === false. A present-but-
    // valid verdict must still be ignored.
    const ds = [makeDetection({ integrity: { valid: true, issues: [] } })];
    expect(summarizeIntegrity(ds)).toEqual(EMPTY_SCAN_INTEGRITY_SUMMARY);
  });

  it('tallies a single issue on a single detection', () => {
    const ds = [withIntegrity(['DUPLICATE_EVIDENCE'])];
    const s = summarizeIntegrity(ds);
    expect(s.affectedDetectionCount).toBe(1);
    expect(s.totalIssues).toBe(1);
    expect(s.issueCounts).toHaveLength(1);
    expect(s.issueCounts[0]?.issue).toBe('DUPLICATE_EVIDENCE');
    expect(s.issueCounts[0]?.label).toBe('Duplicate evidence');
    expect(s.issueCounts[0]?.count).toBe(1);
  });

  it('tallies multiple issue types on a single detection', () => {
    const ds = [withIntegrity(['INVALID_EVIDENCE_TYPE', 'EMPTY_EVIDENCE'])];
    const s = summarizeIntegrity(ds);
    expect(s.affectedDetectionCount).toBe(1);
    expect(s.totalIssues).toBe(2);
    expect(s.issueCounts).toHaveLength(2);
    // Canonical order: INVALID_EVIDENCE_TYPE (#2) before EMPTY_EVIDENCE (#5).
    expect(s.issueCounts.map((t) => t.issue)).toEqual(['INVALID_EVIDENCE_TYPE', 'EMPTY_EVIDENCE']);
  });

  it('aggregates overlapping issue types across multiple detections', () => {
    const ds = [
      withIntegrity(['EMPTY_EVIDENCE', 'INVALID_EVIDENCE_TYPE']),
      withIntegrity(['EMPTY_EVIDENCE']),
      withIntegrity(['PROVENANCE_MISMATCH', 'EMPTY_EVIDENCE']),
    ];
    const s = summarizeIntegrity(ds);
    expect(s.affectedDetectionCount).toBe(3);
    expect(s.totalIssues).toBe(5);
    // EMPTY_EVIDENCE appears in all three detections (count 3).
    expect(s.issueCounts.find((t) => t.issue === 'EMPTY_EVIDENCE')?.count).toBe(3);
    expect(s.issueCounts.find((t) => t.issue === 'INVALID_EVIDENCE_TYPE')?.count).toBe(1);
    expect(s.issueCounts.find((t) => t.issue === 'PROVENANCE_MISMATCH')?.count).toBe(1);
    // Canonical ordering preserved.
    expect(s.issueCounts.map((t) => t.issue)).toEqual([
      'INVALID_EVIDENCE_TYPE',
      'PROVENANCE_MISMATCH',
      'EMPTY_EVIDENCE',
    ]);
  });

  it('preserves canonical INTEGRITY_ISSUE_ORDER even for reversed input', () => {
    const ds = [
      withIntegrity(['EMPTY_EVIDENCE']), // #5
      withIntegrity(['PROVENANCE_MISMATCH']), // #4
      withIntegrity(['DUPLICATE_EVIDENCE']), // #3
      withIntegrity(['INVALID_EVIDENCE_TYPE']), // #2
      withIntegrity(['INVALID_DETECTION_IDENTITY']), // #1
    ];
    const s = summarizeIntegrity(ds);
    expect(s.issueCounts.map((t) => t.issue)).toEqual([...INTEGRITY_ISSUE_ORDER]);
    expect(s.affectedDetectionCount).toBe(5);
    expect(s.totalIssues).toBe(5);
  });

  it('omits issue types with a zero count (sparse reporting)', () => {
    const ds = [withIntegrity(['DUPLICATE_EVIDENCE'])];
    const s = summarizeIntegrity(ds);
    expect(s.issueCounts.find((t) => t.issue === 'INVALID_DETECTION_IDENTITY')).toBeUndefined();
    expect(s.issueCounts.find((t) => t.issue === 'EMPTY_EVIDENCE')).toBeUndefined();
    expect(s.issueCounts.find((t) => t.issue === 'DUPLICATE_EVIDENCE')?.count).toBe(1);
  });

  it('is a pure, deterministic aggregation (same input → same output)', () => {
    const ds = [
      withIntegrity(['EMPTY_EVIDENCE', 'DUPLICATE_EVIDENCE']),
      withIntegrity(['INVALID_EVIDENCE_TYPE', 'EMPTY_EVIDENCE']),
      withIntegrity(['PROVENANCE_MISMATCH']),
    ];
    expect(summarizeIntegrity(ds)).toEqual(summarizeIntegrity(ds));
  });

  it('treats a clean detection followed by an invalid one correctly', () => {
    const ds = [makeDetection(), withIntegrity(['INVALID_DETECTION_IDENTITY'])];
    const s = summarizeIntegrity(ds);
    expect(s.affectedDetectionCount).toBe(1);
    expect(s.totalIssues).toBe(1);
    expect(s.issueCounts.map((t) => t.issue)).toEqual(['INVALID_DETECTION_IDENTITY']);
  });
});
