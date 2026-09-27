/**
 * Unit tests for `technology-detection-history` — the pure transformer that
 * projects a technology's per-scan detection history.
 *
 * These tests exercise the REAL pipeline (`detectionToResponse` →
 * `getScanDetectionResults` → `computeDetectionIntegrity`/`computeDetectionProvenance`
 * → `computeSignalQuality`) by feeding hand-built domain `ScanResult` fixtures
 * in, so the history faithfully reflects what the scan-detail page computes.
 */

import { describe, it, expect } from 'vitest';
import type { ScanResult } from '@devlens/application';
import type { Detection } from '@devlens/core';
import { technologyDetectionHistory } from './technology-detection-history.js';

// ─── Fixture builders ────────────────────────────────────────────────

function makeScan(
  id: string,
  createdAt: string,
  status: ScanResult['scan']['status'],
  detections: Detection[] = [],
): ScanResult {
  return {
    scan: {
      id,
      createdAt,
      target: { url: 'https://example.com/', hostname: 'example.com' },
      status,
    },
    // The transformer only filters on `status.type`; snapshot contents are
    // irrelevant to the projection, so a null snapshot is fine here.
    snapshot: null,
    detections,
  } as unknown as ScanResult;
}

// The domain `ScanStatus` carries branded `Timestamp` fields; cast the helper
// returns through the indexed status type so fixtures are type-clean without a
// live DB.
const COMPLETED = (completedAt: string): ScanResult['scan']['status'] =>
  ({ type: 'completed', completedAt }) as unknown as ScanResult['scan']['status'];
const FAILED = (
  failedAt: string,
  err: { code: string; message: string },
): ScanResult['scan']['status'] =>
  ({ type: 'failed', failedAt, error: err }) as unknown as ScanResult['scan']['status'];

function httpHeaderEvidence(value = 'nginx'): Detection['evidence'][number] {
  return { type: 'http_header', name: 'Server', value } as Detection['evidence'][number];
}

function makeDetection(
  id: string,
  confidence = 80,
  evidence = [httpHeaderEvidence()],
  overrides: Record<string, unknown> = {},
): Detection {
  return {
    technology: { id, name: id, category: 'server' },
    confidence,
    evidence,
    ...overrides,
  } as unknown as Detection;
}

// A clean, directly-observed detection of `nginx` (80 confidence, 1 evidence).
const NGINX = 'nginx';

// ─── 1. Absent ───────────────────────────────────────────────────────

describe('technologyDetectionHistory — absent', () => {
  it('returns [] when no scan detects the technology', () => {
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        makeDetection('react', 90),
      ]),
      makeScan('scan_b', '2025-06-02T10:00:00.000Z', COMPLETED('2025-06-02T10:00:05.000Z'), [
        makeDetection('vue', 70),
      ]),
    ];

    const history = technologyDetectionHistory(scans, NGINX);
    expect(history).toEqual([]);
  });

  it('returns [] for a technology only present in a failed scan', () => {
    // Failed scans carry no detections by domain design, but a non-empty
    // detection array on a failed scan must still be filtered out.
    const scans = [
      makeScan(
        'scan_fail',
        '2025-06-01T10:00:00.000Z',
        FAILED('2025-06-01T10:00:01.000Z', { code: 'timeout', message: 'timed out' }),
        [makeDetection(NGINX, 80)],
      ),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history).toEqual([]);
  });

  it('returns [] for an empty scan set', () => {
    expect(technologyDetectionHistory([], NGINX)).toEqual([]);
  });
});

// ─── 2. Present (single) ─────────────────────────────────────────────

describe('technologyDetectionHistory — present', () => {
  it('returns one entry when exactly one completed scan detects the tech', () => {
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        makeDetection(NGINX, 80),
        makeDetection('react', 90),
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history).toHaveLength(1);
    expect(history[0]!.scanId).toBe('scan_a');
    expect(history[0]!.confidence).toBe(80);
  });
});

// ─── 3. Ordering & tie-break ──────────────────────────────────────────

describe('technologyDetectionHistory — ordering', () => {
  it('orders scans newest-first by createdAt DESC', () => {
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        makeDetection(NGINX),
      ]),
      makeScan('scan_b', '2025-06-03T10:00:00.000Z', COMPLETED('2025-06-03T10:00:05.000Z'), [
        makeDetection(NGINX),
      ]),
      makeScan('scan_c', '2025-06-02T10:00:00.000Z', COMPLETED('2025-06-02T10:00:05.000Z'), [
        makeDetection(NGINX),
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history.map((e) => e.scanId)).toEqual(['scan_b', 'scan_c', 'scan_a']);
  });

  it('tie-breaks equal timestamps by scanId ASC', () => {
    const ts = '2025-06-01T10:00:00.000Z';
    const scans = [
      makeScan('scan_b', ts, COMPLETED(ts), [makeDetection(NGINX)]),
      makeScan('scan_a', ts, COMPLETED(ts), [makeDetection(NGINX)]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history.map((e) => e.scanId)).toEqual(['scan_a', 'scan_b']);
  });
});

// ─── 4. Field fidelity ────────────────────────────────────────────────

describe('technologyDetectionHistory — field fidelity', () => {
  it('preserves confidence exactly (no rounding)', () => {
    const detection = makeDetection(NGINX, 85);
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        detection,
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history[0]!.confidence).toBe(85);
  });

  it('forwards version verbatim (string | null) and preserves versionSource', () => {
    const detection = makeDetection(NGINX, 80, [httpHeaderEvidence()], {
      version: '1.21.0',
      versionSource: 'http_header',
    });
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        detection,
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history[0]!.version).toBe('1.21.0');
    expect(history[0]!.versionSource).toBe('http_header');
    expect(history[0]!.versionConflict).toBe(false);
  });

  it('nullifies version and sets versionConflict on a conflict', () => {
    const detection = makeDetection(NGINX, 80, [httpHeaderEvidence()], {
      versionConflict: true,
      // version itself may still be set on the raw detection; the conflict
      // wins per detectionToResponse (conflict ⇒ version null + flag set).
      version: '1.21.0',
    });
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        detection,
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history[0]!.versionConflict).toBe(true);
    expect(history[0]!.version).toBeNull();
  });

  it('counts evidence post-canonical-dedup (deduplicated)', () => {
    // Two identical evidence items — the pipeline dedups to a single count.
    const dup = httpHeaderEvidence('nginx');
    const detection = makeDetection(NGINX, 80, [dup, { ...dup }]);
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        detection,
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history[0]!.evidenceCount).toBe(1);
  });
});

// ─── 5. Direct vs derived ─────────────────────────────────────────────

describe('technologyDetectionHistory — source', () => {
  it('marks a directly-observed detection as direct and attaches provenance', () => {
    const detection = makeDetection(NGINX, 80, [httpHeaderEvidence()]);
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        detection,
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history[0]!.source).toBe('direct');
    expect(history[0]!.provenance).toBeDefined();
    // Provenance evidenceCount is computed on the raw detection evidence
    // (matches the scan-detail "signals" line); the deduped list may be shorter.
    expect(history[0]!.provenance!.evidenceCount).toBe(1);
    expect(history[0]!.derivedFrom).toBeUndefined();
  });

  it('marks a relationship-derived detection as relationship and omits provenance', () => {
    // A realistic implies-derived detection: no direct evidence, just the
    // relationship edge. (A derived detection that *also* carries direct
    // evidence is a malformed input — exercised in the integrity tests.)
    const detection = makeDetection(NGINX, 60, [], {
      source: 'relationship',
      derivedFrom: [{ source: 'react', sourceName: 'React', type: 'implies' }],
    });
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        detection,
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history[0]!.source).toBe('relationship');
    expect(history[0]!.derivedFrom).toEqual([
      { source: 'react', sourceName: 'React', type: 'implies' },
    ]);
    // Relationship-derived detections carry no direct evidence → no provenance.
    expect(history[0]!.provenance).toBeUndefined();
    // No direct evidence ⇒ signal quality is the deterministic `no_evidence` level.
    expect(history[0]!.signalQuality.level).toBe('no_evidence');
    expect(history[0]!.integrity).toBeNull();
  });
});

// ─── 6. Integrity ────────────────────────────────────────────────────

describe('technologyDetectionHistory — integrity', () => {
  it('records integrity as null (valid) for a clean detection', () => {
    const detection = makeDetection(NGINX, 80, [httpHeaderEvidence()]);
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        detection,
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history[0]!.integrity).toBeNull();
  });

  it('surfaces a single integrity issue (duplicate evidence) from the real validator', () => {
    const dup = httpHeaderEvidence('nginx');
    const detection = makeDetection(NGINX, 80, [dup, { ...dup }]);
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        detection,
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history[0]!.integrity).not.toBeNull();
    expect(history[0]!.integrity!.valid).toBe(false);
    expect(history[0]!.integrity!.issues).toEqual(['DUPLICATE_EVIDENCE']);
  });

  it('preserves canonical issue order for a detection with multiple issues', () => {
    // A deliberately-malformed relationship-derived detection: it carries a
    // canonical duplicate (DUPLICATE_EVIDENCE) *and* provenance it must not
    // carry (PROVENANCE_MISMATCH, since source === 'relationship'). The
    // validator emits both, in INTEGRITY_ISSUE_ORDER.
    const dup = httpHeaderEvidence('nginx');
    const detection = makeDetection(NGINX, 60, [dup, { ...dup }], {
      source: 'relationship',
      derivedFrom: [{ source: 'react', sourceName: 'React', type: 'implies' }],
    });
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        detection,
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history[0]!.integrity).not.toBeNull();
    // The entry forwards the validator's verdict verbatim (no reordering).
    expect(history[0]!.integrity!.valid).toBe(false);
    // Canonical precedence: DUPLICATE_EVIDENCE precedes PROVENANCE_MISMATCH.
    expect(history[0]!.integrity!.issues).toEqual(['DUPLICATE_EVIDENCE', 'PROVENANCE_MISMATCH']);
  });
});

// ─── 7. Scan metadata ────────────────────────────────────────────────

describe('technologyDetectionHistory — scan metadata', () => {
  it('exposes the completed scan status and terminal timestamp', () => {
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        makeDetection(NGINX),
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    expect(history[0]!.scanStatus).toBe('completed');
    expect(history[0]!.scanCompletedAt).toBe('2025-06-01T10:00:05.000Z');
    expect(history[0]!.scanCreatedAt).toBe('2025-06-01T10:00:00.000Z');
  });

  it('forwards the scan target hostname (Step 91 §6) from existing scan data', () => {
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        makeDetection(NGINX),
      ]),
    ];
    const history = technologyDetectionHistory(scans, NGINX);
    // hostname is read from the already-loaded ScanResult.scan.target.hostname
    // (Step 91 §11) — no additional fetch or query.
    expect(history[0]!.scanHostname).toBe('example.com');
  });
});

// ─── 8. Determinism / no mutation ────────────────────────────────────

describe('technologyDetectionHistory — invariants', () => {
  it('does not mutate the input scan array or its detections', () => {
    const dup = httpHeaderEvidence('nginx');
    const detection: Detection = makeDetection(NGINX, 80, [dup, { ...dup }]);
    const originalEvidence = [...detection.evidence];
    const originalOrder = [
      makeScan('scan_b', '2025-06-02T10:00:00.000Z', COMPLETED('2025-06-02T10:00:05.000Z'), [
        detection,
      ]),
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        makeDetection(NGINX),
      ]),
    ];
    const capturedRefs = [...originalOrder];

    technologyDetectionHistory(originalOrder, NGINX);

    // The input array's element order is unchanged (we sort a shallow copy).
    expect(originalOrder.map((s) => s.scan.id)).toEqual(['scan_b', 'scan_a']);
    // No detection object was swapped; element references are intact.
    expect(originalOrder[0]).toBe(capturedRefs[0]);
    expect(originalOrder[1]).toBe(capturedRefs[1]);
    // Detection evidence untouched.
    expect(detection.evidence).toEqual(originalEvidence);
    expect(detection.evidence.length).toBe(2);
  });

  it('is deterministic — same input yields stable output', () => {
    const detection = makeDetection(NGINX, 80, [httpHeaderEvidence()]);
    const scans = [
      makeScan('scan_a', '2025-06-01T10:00:00.000Z', COMPLETED('2025-06-01T10:00:05.000Z'), [
        detection,
      ]),
      makeScan('scan_b', '2025-06-02T10:00:00.000Z', COMPLETED('2025-06-02T10:00:05.000Z'), [
        makeDetection(NGINX, 90, [httpHeaderEvidence('nginx')]),
      ]),
    ];
    const first = technologyDetectionHistory(scans, NGINX);
    const second = technologyDetectionHistory([...scans], NGINX);
    expect(first).toEqual(second);
  });
});
