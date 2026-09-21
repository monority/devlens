/**
 * Pure function tests for the `compareScans` comparison module.
 *
 * These tests verify the deterministic comparison logic without any
 * React, HTTP, or database dependencies. The comparison function
 * operates on plain data structures only.
 */

import { describe, it, expect } from 'vitest';
import { compareScans, evidenceKey } from '../lib/comparison.js';
import { getEvidenceIdentity } from '../lib/evidence-identity.js';
import type { ScanDetailResponse, DetectionResponse } from '../lib/types.js';

// ─── Test fixtures ───────────────────────────────────────────────────

function makeScan(overrides: Partial<ScanDetailResponse> = {}): ScanDetailResponse {
  return {
    scan: {
      id: 'scan_001',
      status: 'completed',
      target: 'https://example.com/',
      hostname: 'example.com',
      createdAt: '2025-06-01T12:00:00.000Z',
      startedAt: null,
      completedAt: '2025-06-01T12:00:05.000Z',
      failedAt: null,
      error: null,
    },
    snapshot: null,
    detections: [],
    ...overrides,
  };
}

function makeDetection(
  id: string,
  name: string,
  category: string,
  confidence: number,
  evidence: DetectionResponse['evidence'] = [],
  overrides: Partial<DetectionResponse> = {},
): DetectionResponse {
  return {
    technology: { id, name, category },
    confidence,
    evidence,
    ...overrides,
  };
}

function makeScanWithDetections(
  detections: DetectionResponse[],
  overrides: Partial<ScanDetailResponse> = {},
): ScanDetailResponse {
  return makeScan({ detections, ...overrides });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('compareScans', () => {
  it('detects a technology added in the right scan', () => {
    const left = makeScanWithDetections([]);
    const right = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);

    const result = compareScans(left, right);

    expect(result.added).toHaveLength(1);
    expect(result.added[0]!.name).toBe('React');
    expect(result.removed).toHaveLength(0);
  });

  it('detects a technology removed in the right scan', () => {
    const left = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);
    const right = makeScanWithDetections([]);

    const result = compareScans(left, right);

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]!.name).toBe('React');
    expect(result.added).toHaveLength(0);
  });

  it('detects an unchanged technology present in both', () => {
    const left = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);
    const right = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);

    const result = compareScans(left, right);

    expect(result.unchanged).toHaveLength(1);
    expect(result.unchanged[0]!.name).toBe('React');
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('detects multiple additions and removals', () => {
    const left = makeScanWithDetections([
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);
    const right = makeScanWithDetections([
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('svelte', 'Svelte', 'frontend', 70),
    ]);

    const result = compareScans(left, right);

    expect(result.added).toHaveLength(1);
    expect(result.added[0]!.name).toBe('Svelte');
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]!.name).toBe('Vue');
    expect(result.unchanged).toHaveLength(1);
    expect(result.unchanged[0]!.name).toBe('React');
  });

  it('ignores ranking/order changes for unchanged technologies', () => {
    const left = makeScanWithDetections([
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);
    const right = makeScanWithDetections([
      makeDetection('vue', 'Vue', 'frontend', 80),
      makeDetection('react', 'React', 'frontend', 95),
    ]);

    const result = compareScans(left, right);

    // Both technologies are present in both scans with the same IDs.
    expect(result.unchanged).toHaveLength(2);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.hasChanges).toBe(false);
  });

  it('detects a confidence score change', () => {
    const left = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 90)]);
    const right = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);

    const result = compareScans(left, right);

    expect(result.scoreChanges).toHaveLength(1);
    expect(result.scoreChanges[0]!.leftConfidence).toBe(90);
    expect(result.scoreChanges[0]!.rightConfidence).toBe(95);
    expect(result.scoreChanges[0]!.scoreDelta).toBe(5);
  });

  it('does not report a score change when confidence is identical', () => {
    const left = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);
    const right = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);

    const result = compareScans(left, right);

    expect(result.scoreChanges).toHaveLength(0);
  });

  it('detects evidence added in the right scan', () => {
    const leftDet = makeDetection('react', 'React', 'frontend', 95, [
      { type: 'http_header', name: 'Server', value: 'nginx' },
    ]);
    const rightDet = makeDetection('react', 'React', 'frontend', 95, [
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'meta_tag', name: 'generator', content: 'React 19' },
    ]);

    const result = compareScans(
      makeScanWithDetections([leftDet]),
      makeScanWithDetections([rightDet]),
    );

    const evidenceChanges = result.evidenceChanges.filter((e) => e.status !== 'unchanged');
    expect(evidenceChanges).toHaveLength(1);
    expect(evidenceChanges[0]!.status).toBe('added');
  });

  it('detects evidence removed from the right scan', () => {
    const leftDet = makeDetection('react', 'React', 'frontend', 95, [
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'meta_tag', name: 'generator', content: 'React 19' },
    ]);
    const rightDet = makeDetection('react', 'React', 'frontend', 95, [
      { type: 'http_header', name: 'Server', value: 'nginx' },
    ]);

    const result = compareScans(
      makeScanWithDetections([leftDet]),
      makeScanWithDetections([rightDet]),
    );

    const evidenceChanges = result.evidenceChanges.filter((e) => e.status !== 'unchanged');
    expect(evidenceChanges).toHaveLength(1);
    expect(evidenceChanges[0]!.status).toBe('removed');
  });

  it('detects identical evidence as unchanged', () => {
    const evidence = [{ type: 'http_header' as const, name: 'Server', value: 'nginx' }];
    const leftDet = makeDetection('react', 'React', 'frontend', 95, evidence);
    const rightDet = makeDetection('react', 'React', 'frontend', 95, evidence);

    const result = compareScans(
      makeScanWithDetections([leftDet]),
      makeScanWithDetections([rightDet]),
    );

    const evidenceChanges = result.evidenceChanges.filter((e) => e.status !== 'unchanged');
    expect(evidenceChanges).toHaveLength(0);
  });

  it('detects different targets', () => {
    const left = makeScanWithDetections([], {
      scan: {
        id: 'scan_left',
        status: 'completed',
        target: 'https://example.com/',
        hostname: 'example.com',
        createdAt: '2025-06-01T12:00:00.000Z',
        startedAt: null,
        completedAt: '2025-06-01T12:00:05.000Z',
        failedAt: null,
        error: null,
      },
    });
    const right = makeScanWithDetections([], {
      scan: {
        id: 'scan_right',
        status: 'completed',
        target: 'https://other.com',
        hostname: 'other.com',
        createdAt: '2025-06-01T13:00:00.000Z',
        startedAt: null,
        completedAt: '2025-06-01T13:00:05.000Z',
        failedAt: null,
        error: null,
      },
    });

    const result = compareScans(left, right);

    expect(result.targetsDiffer).toBe(true);
  });

  it('handles a failed scan on the left side', () => {
    const left = makeScanWithDetections([], {
      scan: {
        id: 'scan_left',
        status: 'failed',
        target: 'https://example.com/',
        hostname: 'example.com',
        createdAt: '2025-06-01T12:00:00.000Z',
        startedAt: '2025-06-01T12:00:01.000Z',
        completedAt: null,
        failedAt: '2025-06-01T12:00:05.000Z',
        error: { code: 'timeout', message: 'Request timed out' },
      },
    });
    const right = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);

    const result = compareScans(left, right);

    expect(result.leftFailed).toBe(true);
    expect(result.rightFailed).toBe(false);
  });

  it('handles empty detection sets on both sides', () => {
    const left = makeScanWithDetections([]);
    const right = makeScanWithDetections([]);

    const result = compareScans(left, right);

    expect(result.technologies).toHaveLength(0);
    expect(result.hasChanges).toBe(false);
  });
});

// ─── Deterministic output ────────────────────────────────────────────

describe('compareScans — determinism', () => {
  it('produces the same output for the same inputs', () => {
    const left = makeScanWithDetections([
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);
    const right = makeScanWithDetections([
      makeDetection('react', 'React', 'frontend', 90),
      makeDetection('svelte', 'Svelte', 'frontend', 70),
    ]);

    const result1 = compareScans(left, right);
    const result2 = compareScans(left, right);

    expect(result1.hasChanges).toBe(result2.hasChanges);
    expect(result1.added.length).toBe(result2.added.length);
    expect(result1.removed.length).toBe(result2.removed.length);
    expect(result1.unchanged.length).toBe(result2.unchanged.length);
    expect(result1.scoreChanges.length).toBe(result2.scoreChanges.length);
  });

  it('produces independent outputs (no shared mutable state)', () => {
    const left = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);
    const right = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 90)]);

    const result = compareScans(left, right);
    expect(result.scoreChanges[0]!.leftConfidence).toBe(95);
    expect(result.scoreChanges[0]!.rightConfidence).toBe(90);

    // Mutating the input should not affect the result.
    left.detections[0]!.confidence = 50;
    expect(result.scoreChanges[0]!.leftConfidence).toBe(95);
  });
});

// ─── evidenceKey backward compatibility ──────────────────────────────
//
// evidenceKey is re-exported from comparison.ts as an alias of
// getEvidenceIdentity. The canonical tests for getEvidenceIdentity live
// in evidence-identity.test.ts. Here we verify compareScans still
// deduplicates evidence correctly using the canonical identity.

describe('evidenceKey backward compatibility (compareScans integration)', () => {
  it('comparison.ts re-exports canonical getEvidenceIdentity as evidenceKey', () => {
    // The re-exported evidenceKey must be the exact same function reference
    // as the canonical getEvidenceIdentity.
    expect(evidenceKey).toBe(getEvidenceIdentity);
  });

  it('compareScans deduplicates evidence by canonical identity', () => {
    const detection: DetectionResponse = {
      technology: { id: 'react', name: 'React', category: 'frontend' },
      confidence: 95,
      evidence: [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'http_header', name: 'Server', value: 'Apache' }, // distinct identity
      ],
    };
    const scan: ScanDetailResponse = {
      scan: {
        id: 's1',
        status: 'completed',
        target: 'https://example.com',
        hostname: 'example.com',
        createdAt: '2025-01-01T00:00:00Z',
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:01:00Z',
        failedAt: null,
        error: null,
      },
      snapshot: null,
      detections: [detection],
    };

    const result = compareScans(scan, scan);
    const unchangedTech = result.unchanged[0]!;

    // Both evidence items now have distinct canonical identities
    // ('http_header:Server|nginx' vs 'http_header:Server|Apache') → 2 unchanged
    expect(unchangedTech.evidenceChanges).toHaveLength(2);
  });
});

// ─── Step 74: change intelligence ─────────────────────────────────────

describe('compareScans — Step 74 change intelligence', () => {
  // Helper: a React detection with overrideable version/provenance fields.
  const react = (overrides: Partial<DetectionResponse> = {}) =>
    makeDetection('react', 'React', 'frontend', 95, [], overrides);
  const versioned = (version: string | null, conflict = false) =>
    react({ version, ...(conflict ? { versionConflict: true } : {}) });

  describe('version change matrix', () => {
    it('transition 6.4.2 → 6.5.1 is version_changed', () => {
      const result = compareScans(
        makeScanWithDetections([versioned('6.4.2')]),
        makeScanWithDetections([versioned('6.5.1')]),
      );
      const change = result.changes[0]!;

      expect(result.versionChanges).toHaveLength(1);
      expect(change.kind).toBe('version_changed');
      expect(change.version.changed).toBe(true);
      expect(change.version.before).toBe('6.4.2');
      expect(change.version.after).toBe('6.5.1');
      expect(change.version.beforeConflict).toBe(false);
      expect(change.version.afterConflict).toBe(false);
      expect(change.versionSource).toBeUndefined();
      expect(result.changeCount).toBe(1);
      expect(result.hasChanges).toBe(true);
    });

    it('drop 6.4.2 → null is version_changed', () => {
      const result = compareScans(
        makeScanWithDetections([versioned('6.4.2')]),
        makeScanWithDetections([versioned(null)]),
      );
      const change = result.changes[0]!;

      expect(change.kind).toBe('version_changed');
      expect(change.version.changed).toBe(true);
      expect(change.version.before).toBe('6.4.2');
      expect(change.version.after).toBeNull();
      expect(result.versionChanges).toHaveLength(1);
    });

    it('gain null → 6.5.1 is version_changed', () => {
      const result = compareScans(
        makeScanWithDetections([versioned(null)]),
        makeScanWithDetections([versioned('6.5.1')]),
      );
      const change = result.changes[0]!;

      expect(change.kind).toBe('version_changed');
      expect(change.version.changed).toBe(true);
      expect(change.version.before).toBeNull();
      expect(change.version.after).toBe('6.5.1');
    });

    it.each([
      ['conflict → 6.5.1', versioned('6.4.2', true), versioned('6.5.1')],
      ['6.4.2 → conflict', versioned('6.4.2'), versioned('6.5.1', true)],
      ['conflict → conflict', versioned('6.4.2', true), versioned('6.5.1', true)],
    ])(
      'conflict on either side forbids a version transition (%s)',
      (_name, leftReact, rightReact) => {
        const result = compareScans(
          makeScanWithDetections([leftReact]),
          makeScanWithDetections([rightReact]),
        );
        const change = result.changes[0]!;

        // No version_changed kind: a conflict forbids fabricating a transition.
        expect(change.kind).toBe('unchanged');
        expect(change.version.changed).toBe(false);
        expect(result.versionChanges).toHaveLength(0);
        expect(change.version.beforeConflict || change.version.afterConflict).toBe(true);
        // Raw version values are still surfaced honestly.
        expect(change.version.before).toBe('6.4.2');
        expect(change.version.after).toBe('6.5.1');
        expect(result.hasChanges).toBe(false);
      },
    );

    it('a versionSource-only difference is not a version change', () => {
      const leftReact = makeDetection('react', 'React', 'frontend', 95, [], {
        version: '6.5.1',
        versionSource: 'meta_tag',
      });
      const rightReact = makeDetection('react', 'React', 'frontend', 95, [], {
        version: '6.5.1',
        versionSource: 'http_header',
      });
      const result = compareScans(
        makeScanWithDetections([leftReact]),
        makeScanWithDetections([rightReact]),
      );
      const change = result.changes[0]!;

      expect(change.kind).toBe('unchanged');
      expect(change.version.changed).toBe(false);
      expect(result.versionChanges).toHaveLength(0);
      // versionSource is only populated when a real version changed.
      expect(change.versionSource).toBeUndefined();
    });
  });

  describe('provenance change', () => {
    it('direct → direct (same) is unchanged', () => {
      const leftReact = makeDetection('react', 'React', 'frontend', 95);
      const rightReact = makeDetection('react', 'React', 'frontend', 95);
      const result = compareScans(
        makeScanWithDetections([leftReact]),
        makeScanWithDetections([rightReact]),
      );
      const change = result.changes[0]!;

      expect(change.provenanceChanged).toBe(false);
      expect(change.kind).toBe('unchanged');
    });

    it('direct → derived (implies) is provenance_changed', () => {
      const leftReact = makeDetection('react', 'React', 'frontend', 95);
      const rightReact = makeDetection('react', 'React', 'frontend', 95, [], {
        source: 'relationship',
        derivedFrom: [{ source: 'next', sourceName: 'Next.js', type: 'implies' }],
      });
      const result = compareScans(
        makeScanWithDetections([leftReact]),
        makeScanWithDetections([rightReact]),
      );
      const change = result.changes[0]!;

      expect(change.provenanceChanged).toBe(true);
      expect(change.kind).toBe('provenance_changed');
      expect(result.changeCount).toBe(1);
    });

    it('derived → derived with the same sources is unchanged', () => {
      const leftReact = makeDetection('react', 'React', 'frontend', 95, [], {
        source: 'relationship',
        derivedFrom: [{ source: 'next', sourceName: 'Next.js', type: 'implies' }],
      });
      const rightReact = makeDetection('react', 'React', 'frontend', 95, [], {
        source: 'relationship',
        derivedFrom: [{ source: 'next', sourceName: 'Next.js', type: 'implies' }],
      });
      const result = compareScans(
        makeScanWithDetections([leftReact]),
        makeScanWithDetections([rightReact]),
      );
      const change = result.changes[0]!;

      expect(change.provenanceChanged).toBe(false);
      expect(change.kind).toBe('unchanged');
    });

    it('derived → derived with different sources is provenance_changed', () => {
      const leftReact = makeDetection('react', 'React', 'frontend', 95, [], {
        source: 'relationship',
        derivedFrom: [{ source: 'next', sourceName: 'Next.js', type: 'implies' }],
      });
      const rightReact = makeDetection('react', 'React', 'frontend', 95, [], {
        source: 'relationship',
        derivedFrom: [{ source: 'webpack', sourceName: 'Webpack', type: 'implies' }],
      });
      const result = compareScans(
        makeScanWithDetections([leftReact]),
        makeScanWithDetections([rightReact]),
      );
      const change = result.changes[0]!;

      expect(change.provenanceChanged).toBe(true);
      expect(change.kind).toBe('provenance_changed');
    });

    it('derived → direct is provenance_changed', () => {
      const leftReact = makeDetection('react', 'React', 'frontend', 95, [], {
        source: 'relationship',
        derivedFrom: [{ source: 'next', sourceName: 'Next.js', type: 'implies' }],
      });
      const rightReact = makeDetection('react', 'React', 'frontend', 95);
      const result = compareScans(
        makeScanWithDetections([leftReact]),
        makeScanWithDetections([rightReact]),
      );
      const change = result.changes[0]!;

      expect(change.provenanceChanged).toBe(true);
      expect(change.kind).toBe('provenance_changed');
    });
  });

  describe('evidence change', () => {
    it('identical evidence → evidenceChanged=false, kind=unchanged', () => {
      const leftReact = makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]);
      const rightReact = makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]);
      const result = compareScans(
        makeScanWithDetections([leftReact]),
        makeScanWithDetections([rightReact]),
      );
      const change = result.changes[0]!;

      expect(change.evidenceChanged).toBe(false);
      expect(change.kind).toBe('unchanged');
      expect(change.evidenceChanges).toHaveLength(1);
      expect(change.evidenceChanges[0]!.status).toBe('unchanged');
    });

    it('swapped evidence (nginx → apache) → evidenceChanged=true, unchanged kind', () => {
      const leftReact = makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]);
      const rightReact = makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'apache' },
      ]);
      const result = compareScans(
        makeScanWithDetections([leftReact]),
        makeScanWithDetections([rightReact]),
      );
      const change = result.changes[0]!;

      expect(change.evidenceChanged).toBe(true);
      // Evidence-only diffs do not elevate the kind above 'unchanged'.
      expect(change.kind).toBe('unchanged');
      expect(result.hasChanges).toBe(true);
      expect(result.unchanged).toContainEqual(expect.objectContaining({ id: 'react' }));
    });
  });

  describe('confidence change', () => {
    it('confidence 90 → 95 is confidence_changed', () => {
      const leftReact = makeDetection('react', 'React', 'frontend', 90);
      const rightReact = makeDetection('react', 'React', 'frontend', 95);
      const result = compareScans(
        makeScanWithDetections([leftReact]),
        makeScanWithDetections([rightReact]),
      );
      const change = result.changes[0]!;

      expect(change.kind).toBe('confidence_changed');
      expect(change.scoreChanged).toBe(true);
      expect(change.confidenceDelta).toBe(5);
      expect(change.scoreDelta).toBe(5);
      expect(change.leftConfidence).toBe(90);
      expect(change.rightConfidence).toBe(95);
      expect(result.scoreChanges).toContainEqual(expect.objectContaining({ id: 'react' }));
      expect(result.unchanged).not.toContainEqual(expect.objectContaining({ id: 'react' }));
    });

    it('identical confidence → unchanged', () => {
      const leftReact = makeDetection('react', 'React', 'frontend', 95);
      const rightReact = makeDetection('react', 'React', 'frontend', 95);
      const result = compareScans(
        makeScanWithDetections([leftReact]),
        makeScanWithDetections([rightReact]),
      );
      const change = result.changes[0]!;

      expect(change.kind).toBe('unchanged');
      expect(change.scoreChanged).toBe(false);
      expect(change.confidenceDelta).toBe(0);
    });
  });

  describe('determinism & ordering', () => {
    it('is stable across repeated calls (JSON-serializable)', () => {
      const left = makeScanWithDetections([
        makeDetection('react', 'React', 'frontend', 95, [], { version: '6.4.2' }),
        makeDetection('svelte', 'Svelte', 'frontend', 80),
      ]);
      const right = makeScanWithDetections([
        makeDetection('react', 'React', 'frontend', 95, [], { version: '6.5.1' }),
        makeDetection('angular', 'Angular', 'framework', 70),
      ]);
      const a = compareScans(left, right);
      const b = compareScans(left, right);

      expect(() => JSON.stringify(a)).not.toThrow();
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('changes are ordered by (kind priority ASC, technology.id ASC)', () => {
      // svelte: added (right-only); angular: removed (left-only);
      // react: version_changed; vue: unchanged.
      const left = makeScanWithDetections([
        makeDetection('angular', 'Angular', 'framework', 70),
        makeDetection('react', 'React', 'frontend', 95, [], { version: '6.4.2' }),
        makeDetection('vue', 'Vue', 'frontend', 80),
      ]);
      const right = makeScanWithDetections([
        makeDetection('react', 'React', 'frontend', 95, [], { version: '6.5.1' }),
        makeDetection('svelte', 'Svelte', 'frontend', 80),
        makeDetection('vue', 'Vue', 'frontend', 80),
      ]);
      const result = compareScans(left, right);

      expect(result.changes.map((c) => c.kind)).toEqual([
        'added',
        'removed',
        'version_changed',
        'unchanged',
      ]);
      expect(result.changes.map((c) => c.id)).toEqual(['svelte', 'angular', 'react', 'vue']);
    });

    it('swap invariance: added ⇄ removed, hasChanges & changeCount preserved', () => {
      const left = makeScanWithDetections([
        makeDetection('angular', 'Angular', 'framework', 70),
        makeDetection('react', 'React', 'frontend', 95, [], { version: '6.4.2' }),
      ]);
      const right = makeScanWithDetections([
        makeDetection('react', 'React', 'frontend', 95, [], { version: '6.5.1' }),
        makeDetection('svelte', 'Svelte', 'frontend', 80),
      ]);
      const fwd = compareScans(left, right);
      const rev = compareScans(right, left);

      expect(fwd.hasChanges).toBe(rev.hasChanges);
      expect(fwd.changeCount).toBe(rev.changeCount);
      expect(fwd.added.map((c) => c.id)).toEqual(rev.removed.map((c) => c.id));
      expect(fwd.removed.map((c) => c.id)).toEqual(rev.added.map((c) => c.id));
      expect(fwd.changes.map((c) => c.id).sort()).toEqual(rev.changes.map((c) => c.id).sort());
    });
  });

  describe('full detection & change record shape', () => {
    it('carries before/after detections for explainability linking', () => {
      const leftReact = makeDetection('react', 'React', 'frontend', 95, [], {
        version: '6.4.2',
      });
      const rightReact = makeDetection('react', 'React', 'frontend', 95, [], {
        version: '6.5.1',
      });
      const result = compareScans(
        makeScanWithDetections([leftReact]),
        makeScanWithDetections([rightReact]),
      );
      const change = result.changes[0]!;

      expect(change.before?.version).toBe('6.4.2');
      expect(change.after?.version).toBe('6.5.1');
    });
  });
});
