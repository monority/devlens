/**
 * Unit tests for the Step-81 detection-result-integrity validator.
 *
 * Pure domain tests (no React, HTTP, DB, browser). They verify:
 * - a well-formed direct detection (with correct provenance) is valid (§1)
 * - a relationship-derived detection with no evidence is valid (§6, §7)
 * - empty evidence on a direct detection is flagged EMPTY_EVIDENCE (§6)
 * - canonical-duplicate evidence is flagged DUPLICATE_EVIDENCE (§5.4)
 * - provenance evidenceCount mismatch is flagged PROVENANCE_MISMATCH (§5.2)
 * - provenance evidenceTypes containing a type not in the evidence is
 *   flagged INVALID_EVIDENCE_TYPE (§5.3)
 * - provenance not derivable from evidence (wrong strongest type, wrong
 *   type ordering) is flagged PROVENANCE_MISMATCH (§5.5)
 * - provenance attached to a derived detection is flagged
 *   PROVENANCE_MISMATCH (§7)
 * - missing/malformed technology identity is flagged
 *   INVALID_DETECTION_IDENTITY (§5.1)
 * - output is deterministic: same input ⇒ same output, canonical issue
 *   ordering (§12)
 * - the input detection is never mutated (§8)
 */

import { describe, it, expect } from 'vitest';
import {
  computeDetectionIntegrity,
  INTEGRITY_ISSUE_ORDER,
  type DetectionIntegrityIssue,
} from './detection-integrity.js';
import { computeDetectionProvenance } from './detection-provenance.js';
import { createDetection, createDerivedDetection } from './detection.js';
import { createConfidence, createTechnologyId, createUrl } from './value-objects.js';
import { createTechnologyCategory } from './technology.js';
import type { Evidence, Technology, Detection, DetectionProvenance } from './';

function makeTech(id = 'nginx'): Technology {
  return {
    id: createTechnologyId(id),
    name: id,
    category: createTechnologyCategory('server'),
  };
}

function httpEvidence(name = 'Server', value = 'nginx'): Evidence {
  return { type: 'http_header', name, value };
}

function metaEvidence(name = 'generator', content = 'nginx'): Evidence {
  return { type: 'meta_tag', name, content };
}

function scriptContentEvidence(snippet = 'window.foo'): Evidence {
  return { type: 'script_content', snippet };
}

// ─── §1 Valid detection ───────────────────────────────────────────────

describe('computeDetectionIntegrity — valid detection (§1)', () => {
  it('returns valid=true / empty issues for a direct detection with correct provenance', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [
      httpEvidence(),
      metaEvidence(),
    ]);
    const provenance = computeDetectionProvenance(detection);

    const result = computeDetectionIntegrity(detection, provenance);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('returns valid=true for a derived detection with no evidence and no provenance (§6, §7)', () => {
    const detection = createDerivedDetection(makeTech('react'), [
      { source: 'nextjs', sourceName: 'Next.js', type: 'implies' },
    ]);

    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('returns valid=true when no provenance is provided (only structural checks run)', () => {
    const detection = createDetection(makeTech(), createConfidence(90), [httpEvidence()]);

    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

// ─── §6 Empty-evidence semantics ─────────────────────────────────────

describe('computeDetectionIntegrity — empty evidence (§6)', () => {
  it('flags EMPTY_EVIDENCE for a direct detection with no evidence', () => {
    // createDetection forbids empty evidence, so build the object directly
    // to exercise the zero-evidence branch (serialization boundary defense).
    const detection = {
      technology: makeTech(),
      confidence: 80,
      evidence: [] as readonly Evidence[],
    } as unknown as Detection;

    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(['EMPTY_EVIDENCE']);
  });

  it('does NOT flag EMPTY_EVIDENCE for a derived detection (§6)', () => {
    const detection = {
      technology: makeTech(),
      confidence: 0,
      evidence: [] as readonly Evidence[],
      source: 'relationship' as const,
      derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
    } as unknown as Detection;

    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

// ─── §5.4 Duplicate evidence ─────────────────────────────────────────

describe('computeDetectionIntegrity — duplicate evidence (§5.4)', () => {
  it('flags DUPLICATE_EVIDENCE when two evidence items share the same canonical identity', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [
      httpEvidence('Server', 'nginx'),
      httpEvidence('Server', 'nginx'),
    ]);

    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(['DUPLICATE_EVIDENCE']);
  });

  it('does not flag duplicates for evidence with the same name but different values', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [
      httpEvidence('Server', 'nginx'),
      httpEvidence('Server', 'apache'),
    ]);

    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('does not flag duplicates for a single evidence item', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [httpEvidence()]);

    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('detects duplicates across different evidence types with the same fields', () => {
    // resource and link both use a URL, but different types → NOT duplicates.
    const detection = createDetection(makeTech(), createConfidence(95), [
      { type: 'resource', url: createUrl('https://cdn.example.com/logo.png') },
      { type: 'link', url: createUrl('https://cdn.example.com/logo.png') },
    ]);

    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('detects duplicate resource_content items (url + resourceType + match)', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [
      {
        type: 'resource_content',
        url: createUrl('https://cdn.example.com/main.js'),
        resourceType: 'script',
        match: '__NEXT_DATA__',
        snippet: 'context',
      },
      {
        type: 'resource_content',
        url: createUrl('https://cdn.example.com/main.js'),
        resourceType: 'script',
        match: '__NEXT_DATA__',
        snippet: 'different context',
      },
    ]);
    // Same url + resourceType + match → canonical duplicate (snippet is not
    // part of the canonical identity, mirroring getEvidenceKey in detectors).
    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(['DUPLICATE_EVIDENCE']);
  });

  it('detects duplicate evidence with differing URL casing (URL normalized)', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [
      { type: 'script_url', url: createUrl('https://cdn.example.com/APP.JS') },
      { type: 'script_url', url: createUrl('https://cdn.example.com/app.js') },
    ]);

    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(['DUPLICATE_EVIDENCE']);
  });
});

// ─── §5.2 / §5.5 Provenance consistency ──────────────────────────────

describe('computeDetectionIntegrity — provenance consistency (§5.2, §5.5)', () => {
  it('flags PROVENANCE_MISMATCH when evidenceCount is wrong', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [
      httpEvidence(),
      metaEvidence(),
    ]);
    const provenance: DetectionProvenance = {
      evidenceCount: 5, // wrong — should be 2
      evidenceTypes: ['http_header', 'meta_tag'],
      strongestEvidenceType: 'http_header',
    };

    const result = computeDetectionIntegrity(detection, provenance);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('PROVENANCE_MISMATCH');
  });

  it('flags PROVENANCE_MISMATCH when strongestEvidenceType is wrong', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [
      httpEvidence(),
      metaEvidence(),
    ]);
    const provenance: DetectionProvenance = {
      evidenceCount: 2,
      evidenceTypes: ['http_header', 'meta_tag'],
      strongestEvidenceType: 'meta_tag', // wrong — should be 'http_header' (higher precedence)
    };

    const result = computeDetectionIntegrity(detection, provenance);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('PROVENANCE_MISMATCH');
  });

  it('flags PROVENANCE_MISMATCH when evidenceTypes ordering is wrong (§5.5)', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [
      scriptContentEvidence(),
      { type: 'script_url', url: createUrl('https://cdn.example.com/app.js') },
      metaEvidence(),
    ]);
    const provenance: DetectionProvenance = {
      evidenceCount: 3,
      // Wrong order: should be [meta_tag, script_url, script_content] per §6
      evidenceTypes: ['script_content', 'script_url', 'meta_tag'],
      strongestEvidenceType: 'meta_tag',
    };

    const result = computeDetectionIntegrity(detection, provenance);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('PROVENANCE_MISMATCH');
  });
});

// ─── §5.3 Evidence type consistency ──────────────────────────────────

describe('computeDetectionIntegrity — evidence type consistency (§5.3)', () => {
  it('flags INVALID_EVIDENCE_TYPE when provenance lists a fabricated type', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [httpEvidence()]);
    const provenance: DetectionProvenance = {
      evidenceCount: 1,
      // 'resource' is fabricated — not present in the evidence
      evidenceTypes: ['http_header', 'resource'],
      strongestEvidenceType: 'http_header',
    };

    const result = computeDetectionIntegrity(detection, provenance);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('INVALID_EVIDENCE_TYPE');
    expect(result.issues).toContain('PROVENANCE_MISMATCH');
  });

  it('flags INVALID_EVIDENCE_TYPE when provenance contains a stale type', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [httpEvidence()]);
    const provenance: DetectionProvenance = {
      evidenceCount: 1,
      // 'meta_tag' was deduplicated away — it's stale
      evidenceTypes: ['http_header', 'meta_tag'],
      strongestEvidenceType: 'http_header',
    };

    const result = computeDetectionIntegrity(detection, provenance);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('INVALID_EVIDENCE_TYPE');
    expect(result.issues).toContain('PROVENANCE_MISMATCH');
  });

  it('does not flag INVALID_EVIDENCE_TYPE when provenance types exactly match evidence', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [
      httpEvidence(),
      metaEvidence(),
    ]);
    const provenance = computeDetectionProvenance(detection);

    const result = computeDetectionIntegrity(detection, provenance);

    expect(result.issues).not.toContain('INVALID_EVIDENCE_TYPE');
  });
});

// ─── §7 Derived detection distinction ────────────────────────────────

describe('computeDetectionIntegrity — derived detection provenance (§7)', () => {
  it('flags PROVENANCE_MISMATCH when provenance is attached to a derived detection', () => {
    const detection = {
      technology: makeTech(),
      confidence: 0,
      evidence: [] as readonly Evidence[],
      source: 'relationship' as const,
      derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
    } as unknown as Detection;
    const provenance: DetectionProvenance = {
      evidenceCount: 0,
      evidenceTypes: [],
    };

    const result = computeDetectionIntegrity(detection, provenance);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(['PROVENANCE_MISMATCH']);
  });
});

// ─── §5.1 Detection identity ─────────────────────────────────────────

describe('computeDetectionIntegrity — detection identity (§5.1)', () => {
  it('flags INVALID_DETECTION_IDENTITY when technology.id is empty', () => {
    const detection = {
      technology: { id: '', name: 'nginx', category: 'server' },
      confidence: 95,
      evidence: [httpEvidence()],
    } as unknown as Detection;

    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(['INVALID_DETECTION_IDENTITY']);
  });

  it('flags INVALID_DETECTION_IDENTITY when technology is null', () => {
    const detection = {
      technology: null,
      confidence: 95,
      evidence: [httpEvidence()],
    } as unknown as Detection;

    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(['INVALID_DETECTION_IDENTITY']);
  });

  it('flags INVALID_DETECTION_IDENTITY when technology.id is not a string', () => {
    const detection = {
      technology: { id: 123, name: 'nginx', category: 'server' },
      confidence: 95,
      evidence: [httpEvidence()],
    } as unknown as Detection;

    const result = computeDetectionIntegrity(detection);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(['INVALID_DETECTION_IDENTITY']);
  });
});

// ─── §12 Determinism & canonical ordering ───────────────────────────

describe('computeDetectionIntegrity — determinism & ordering (§12)', () => {
  it('produces identical output for identical input across calls', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [
      httpEvidence(),
      metaEvidence(),
    ]);
    const provenance = computeDetectionProvenance(detection);

    const a = computeDetectionIntegrity(detection, provenance);
    const b = computeDetectionIntegrity(detection, provenance);

    expect(a).toEqual(b);
  });

  it('issues are always in canonical order (§12)', () => {
    // Construct a detection that triggers multiple issues simultaneously:
    // - invalid identity (empty id)
    // - duplicate evidence
    // - provenance mismatch (count wrong)
    // - invalid evidence type (fabricated type in provenance)
    const detection = {
      technology: { id: '', name: '', category: '' },
      confidence: 0,
      evidence: [httpEvidence('Server', 'nginx'), httpEvidence('Server', 'nginx')],
    } as unknown as Detection;
    const provenance: DetectionProvenance = {
      evidenceCount: 99,
      evidenceTypes: ['http_header', 'meta_tag'], // 'meta_tag' is fabricated
      strongestEvidenceType: 'meta_tag',
    };

    const result = computeDetectionIntegrity(detection, provenance);

    // Issues must appear in INTEGRITY_ISSUE_ORDER, no duplicates.
    const expectedOrder = INTEGRITY_ISSUE_ORDER.filter((i) =>
      [
        'INVALID_DETECTION_IDENTITY',
        'INVALID_EVIDENCE_TYPE',
        'DUPLICATE_EVIDENCE',
        'PROVENANCE_MISMATCH',
      ].includes(i),
    );
    expect(result.issues).toEqual(expectedOrder);
    // No duplicates.
    expect(new Set(result.issues).size).toBe(result.issues.length);
  });

  it('canonical order matches the §12 specification', () => {
    expect(INTEGRITY_ISSUE_ORDER).toEqual([
      'INVALID_DETECTION_IDENTITY',
      'INVALID_EVIDENCE_TYPE',
      'DUPLICATE_EVIDENCE',
      'PROVENANCE_MISMATCH',
      'EMPTY_EVIDENCE',
    ]);
  });

  it('produces a plain serializable object (no runtime class leakage)', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [httpEvidence()]);
    const result = computeDetectionIntegrity(detection);

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    if (result.issues.length > 0) {
      for (const issue of result.issues) {
        expect(typeof issue).toBe('string');
      }
    }
  });

  it('is a pure function (same input ⇒ same output, independent of prior calls)', () => {
    const detection = createDetection(makeTech(), createConfidence(100), [
      httpEvidence(),
      metaEvidence(),
      scriptContentEvidence(),
    ]);

    const r1 = computeDetectionIntegrity(detection);
    const r2 = computeDetectionIntegrity(detection);
    const r3 = computeDetectionIntegrity(detection);

    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });
});

// ─── §8 No mutation ──────────────────────────────────────────────────

describe('computeDetectionIntegrity — no mutation (§8)', () => {
  it('does not mutate the input detection', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [
      httpEvidence(),
      metaEvidence(),
    ]);
    const originalLength = detection.evidence.length;
    const originalEvidence = [...detection.evidence];
    const provenance = computeDetectionProvenance(detection);

    computeDetectionIntegrity(detection, provenance);

    expect(detection.evidence.length).toBe(originalLength);
    expect(detection.evidence).toEqual(originalEvidence);
  });

  it('does not mutate the input provenance', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [httpEvidence()]);
    const provenance: DetectionProvenance = {
      evidenceCount: 2, // intentionally wrong to trigger checks
      evidenceTypes: ['http_header', 'meta_tag'],
      strongestEvidenceType: 'http_header',
    };
    const provenanceSnapshot = JSON.parse(JSON.stringify(provenance));

    computeDetectionIntegrity(detection, provenance);

    expect(provenance).toEqual(provenanceSnapshot);
  });

  it('returns the original detection unchanged (no side-effects)', () => {
    const detection = createDetection(makeTech(), createConfidence(95), [
      httpEvidence(),
      metaEvidence(),
      scriptContentEvidence(),
    ]);
    const original = JSON.parse(JSON.stringify(detection)) as Detection;

    computeDetectionIntegrity(detection, computeDetectionProvenance(detection));

    expect(detection).toEqual(original);
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────

describe('computeDetectionIntegrity — edge cases', () => {
  it('handles a single evidence item with correct provenance', () => {
    const detection = createDetection(makeTech(), createConfidence(100), [
      { type: 'script_url', url: createUrl('https://cdn.example.com/app.js') },
    ]);

    const result = computeDetectionIntegrity(detection, computeDetectionProvenance(detection));

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('handles all 9 evidence types with correct provenance', () => {
    const evidence: Evidence[] = [
      { type: 'html', selector: '#app', snippet: '<div>' },
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'meta_tag', name: 'generator', content: 'Next.js' },
      { type: 'script_url', url: createUrl('https://cdn.example.com/app.js') },
      { type: 'script_content', snippet: '__NEXT_DATA__' },
      { type: 'javascript_global', globalName: 'React' },
      { type: 'resource', url: createUrl('https://cdn.example.com/logo.png') },
      { type: 'link', url: createUrl('https://cdn.example.com/style.css') },
      {
        type: 'resource_content',
        url: createUrl('https://cdn.example.com/main.js'),
        resourceType: 'script',
        match: '__NEXT_DATA__',
        snippet: 'context',
      },
    ];
    const detection = createDetection(makeTech(), createConfidence(100), evidence);

    const result = computeDetectionIntegrity(detection, computeDetectionProvenance(detection));

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('flags EMPTY_EVIDENCE alongside PROVENANCE_MISMATCH when evidence is empty but provenance claims otherwise', () => {
    // Direct detection (no source) with empty evidence and a provenance
    // claiming evidenceCount > 0 — both issues are reported.
    const detection = {
      technology: makeTech(),
      confidence: 80,
      evidence: [] as readonly Evidence[],
    } as unknown as Detection;
    const provenance: DetectionProvenance = {
      evidenceCount: 1,
      evidenceTypes: ['http_header'],
      strongestEvidenceType: 'http_header',
    };

    const result = computeDetectionIntegrity(detection, provenance);

    expect(result.valid).toBe(false);
    // The provenance lists 'http_header' but the evidence is empty, so the
    // type is fabricated (§5.3 → INVALID_EVIDENCE_TYPE). The count mismatch
    // triggers PROVENANCE_MISMATCH (§5.2/§5.5). The empty evidence on a
    // direct detection triggers EMPTY_EVIDENCE (§6). Canonical order:
    // INVALID_EVIDENCE_TYPE < PROVENANCE_MISMATCH < EMPTY_EVIDENCE.
    expect(result.issues).toEqual([
      'INVALID_EVIDENCE_TYPE',
      'PROVENANCE_MISMATCH',
      'EMPTY_EVIDENCE',
    ]);
  });

  it('handles provenance with absent strongestEvidenceType for a zero-evidence provenance on a derived detection (§7)', () => {
    const detection = {
      technology: makeTech(),
      confidence: 0,
      evidence: [] as readonly Evidence[],
      source: 'relationship' as const,
      derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
    } as unknown as Detection;
    const provenance: DetectionProvenance = {
      evidenceCount: 0,
      evidenceTypes: [],
    };

    const result = computeDetectionIntegrity(detection, provenance);

    // §7: derived detections must not carry provenance → PROVENANCE_MISMATCH.
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(['PROVENANCE_MISMATCH']);
  });
});

// ─── Re-export check (locks the public API surface) ─────────────────

function _assertExports(): void {
  const fn: typeof computeDetectionIntegrity = computeDetectionIntegrity;
  const order: readonly DetectionIntegrityIssue[] = INTEGRITY_ISSUE_ORDER;
  void [fn, order];
}
void _assertExports;
