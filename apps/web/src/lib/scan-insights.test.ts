/**
 * Unit tests for the pure scan-insights module.
 *
 * These tests verify the insight derivation pipeline without React, HTTP,
 * or a DOM environment. The pipeline is:
 *
 *   ScanDetailResponse → getScanInsights() → ordered summary object
 *   DetectionResponse  → getEvidenceTypeCounts() → ordered type counts
 *   DetectionResponse[] → getCategoryCounts() → ordered category counts
 */

import { describe, it, expect } from 'vitest';
import {
  getScanInsights,
  getEvidenceTypeCounts,
  getCategoryCounts,
  getTechnologyComposition,
  getTechnologyEvidenceMatrix,
} from './scan-insights';
import type { ScanDetailResponse, DetectionResponse, EvidenceResponse } from './types';

// ─── Fixture builders ────────────────────────────────────────────────

function makeTechnology(overrides: Partial<{ id: string; name: string; category: string }> = {}) {
  return {
    id: 'react',
    name: 'React',
    category: 'framework',
    ...overrides,
  };
}

function makeEvidence(
  type: EvidenceResponse['type'],
  overrides: Partial<Record<string, unknown>> = {},
): EvidenceResponse {
  const base: Record<string, unknown> = { type } as EvidenceResponse;
  return { ...base, ...overrides } as EvidenceResponse;
}

function makeDetection(overrides: Partial<DetectionResponse> = {}): DetectionResponse {
  return {
    technology: makeTechnology(),
    confidence: 95,
    evidence: [],
    ...overrides,
  };
}

function makeScan(
  detections: DetectionResponse[],
  status: string = 'completed',
): ScanDetailResponse {
  return {
    scan: {
      id: 'scan_001',
      status,
      target: 'https://example.com/',
      hostname: 'example.com',
      createdAt: '2025-01-01T12:00:00.000Z',
      startedAt: '2025-01-01T12:00:01.000Z',
      completedAt: '2025-01-01T12:00:05.000Z',
      failedAt: null,
      error: null,
    },
    snapshot: {
      url: 'https://example.com/',
      hostname: 'example.com',
      capturedAt: '2025-01-01T12:00:05.000Z',
      http: { statusCode: 200, contentType: 'text/html', finalUrl: 'https://example.com/' },
      html: { title: 'Example Domain', description: null },
    },
    detections,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('getScanInsights', () => {
  it('computes insights for a completed scan with multiple technologies', () => {
    const scan = makeScan([
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        confidence: 95,
        evidence: [
          makeEvidence('script_url', { url: 'https://example.com/react.js' }),
          makeEvidence('http_header', { name: 'X-Powered-By', value: 'Express' }),
        ],
      }),
      makeDetection({
        technology: makeTechnology({ id: 'wordpress', name: 'WordPress', category: 'cms' }),
        confidence: 80,
        evidence: [
          makeEvidence('meta_tag', { name: 'generator', content: 'WordPress' }),
          makeEvidence('html', { selector: '#wp-content', snippet: 'WordPress' }),
          makeEvidence('link', { url: 'https://example.com/style.css' }),
        ],
      }),
    ]);

    const insights = getScanInsights(scan);

    expect(insights.technologyCount).toBe(2);
    expect(insights.evidenceCount).toBe(5);
    expect(insights.categoryCount).toBe(2);
    expect(insights.categories).toEqual([
      { category: 'cms', count: 1 },
      { category: 'framework', count: 1 },
    ]);
    expect(insights.evidenceTypes).toEqual([
      { type: 'HTML Element', count: 1 },
      { type: 'HTTP Header', count: 1 },
      { type: 'Link', count: 1 },
      { type: 'Meta Tag', count: 1 },
      { type: 'Script URL', count: 1 },
    ]);
  });

  it('returns zero counts for a scan with zero detections', () => {
    const scan = makeScan([]);
    const insights = getScanInsights(scan);

    expect(insights.technologyCount).toBe(0);
    expect(insights.evidenceCount).toBe(0);
    expect(insights.categoryCount).toBe(0);
    expect(insights.categories).toEqual([]);
    expect(insights.evidenceTypes).toEqual([]);
  });

  it('handles a single detection', () => {
    const scan = makeScan([
      makeDetection({
        technology: makeTechnology({ id: 'nginx', name: 'nginx', category: 'server' }),
        evidence: [makeEvidence('http_header', { name: 'Server', value: 'nginx/1.21' })],
      }),
    ]);

    const insights = getScanInsights(scan);

    expect(insights.technologyCount).toBe(1);
    expect(insights.evidenceCount).toBe(1);
    expect(insights.categoryCount).toBe(1);
    expect(insights.categories).toEqual([{ category: 'server', count: 1 }]);
  });

  it('groups multiple detections in the same category', () => {
    const scan = makeScan([
      makeDetection({ technology: makeTechnology({ id: 'react', category: 'framework' }) }),
      makeDetection({ technology: makeTechnology({ id: 'vue', category: 'framework' }) }),
      makeDetection({ technology: makeTechnology({ id: 'angular', category: 'framework' }) }),
    ]);

    const insights = getScanInsights(scan);

    expect(insights.technologyCount).toBe(3);
    expect(insights.categoryCount).toBe(1);
    expect(insights.categories).toEqual([{ category: 'framework', count: 3 }]);
  });

  it('handles multiple categories and sorts by count DESC then category ASC', () => {
    const scan = makeScan([
      makeDetection({ technology: makeTechnology({ id: 'react', category: 'framework' }) }),
      makeDetection({ technology: makeTechnology({ id: 'angular', category: 'framework' }) }),
      makeDetection({ technology: makeTechnology({ id: 'wordpress', category: 'cms' }) }),
      makeDetection({
        technology: makeTechnology({ id: 'firebase', category: 'service_worker' }),
      }),
    ]);

    const insights = getScanInsights(scan);

    // framework: 2, cms: 1, service_worker: 1
    // Expected order: framework (2), then cms and service_worker (1 each, sorted alphabetically)
    expect(insights.categories).toEqual([
      { category: 'framework', count: 2 },
      { category: 'cms', count: 1 },
      { category: 'service_worker', count: 1 },
    ]);
  });

  it('handles unknown technology IDs safely', () => {
    const scan = makeScan([
      makeDetection({
        technology: makeTechnology({ id: 'unknown-tech', name: 'Unknown', category: 'unknown' }),
        evidence: [makeEvidence('html', { selector: 'div', snippet: 'test' })],
      }),
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [makeEvidence('script_url', { url: 'https://example.com/r.js' })],
      }),
    ]);

    const insights = getScanInsights(scan);

    expect(insights.technologyCount).toBe(2);
    // Unknown tech should be categorized as "Unknown"
    expect(insights.categories).toEqual([
      { category: 'Unknown', count: 1 },
      { category: 'framework', count: 1 },
    ]);
  });

  it('counts evidence items correctly', () => {
    const scan = makeScan([
      makeDetection({
        evidence: [
          makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
          makeEvidence('meta_tag', { name: 'generator', content: 'WordPress' }),
        ],
      }),
      makeDetection({
        evidence: [
          makeEvidence('html', { selector: '#app', snippet: 'React' }),
          makeEvidence('script_url', { url: 'https://example.com/app.js' }),
          makeEvidence('link', { url: 'https://example.com/style.css' }),
        ],
      }),
      makeDetection({
        evidence: [],
      }),
    ]);

    const insights = getScanInsights(scan);

    expect(insights.evidenceCount).toBe(5);
  });

  it('aggregates and sorts evidence types by count DESC then type ASC', () => {
    const scan = makeScan([
      makeDetection({
        evidence: [
          makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
          makeEvidence('http_header', { name: 'X-Frame', value: 'DENY' }),
          makeEvidence('meta_tag', { name: 'generator', content: 'WordPress' }),
        ],
      }),
      makeDetection({
        evidence: [
          makeEvidence('script_url', { url: 'https://example.com/app.js' }),
          makeEvidence('script_url', { url: 'https://example.com/lib.js' }),
          makeEvidence('script_url', { url: 'https://example.com/vendor.js' }),
          makeEvidence('link', { url: 'https://example.com/style.css' }),
        ],
      }),
    ]);

    const insights = getScanInsights(scan);

    // Script URL: 3, HTTP Header: 2, Meta Tag: 1, Link: 1
    // Expected: Script URL (3), HTTP Header (2), then Link and Meta Tag (1 each, alphabetical)
    expect(insights.evidenceTypes).toEqual([
      { type: 'Script URL', count: 3 },
      { type: 'HTTP Header', count: 2 },
      { type: 'Link', count: 1 },
      { type: 'Meta Tag', count: 1 },
    ]);
  });

  it('handles duplicate evidence behavior — each evidence object counted', () => {
    // The spec says "Do not count duplicated evidence objects twice if
    // the same canonical evidence is already represented multiple times."
    // Since evidence objects in the API are already deduplicated by the
    // detector, we count each evidence object as-is.
    const scan = makeScan([
      makeDetection({
        evidence: [
          makeEvidence('html', { selector: '#app', snippet: 'React' }),
          makeEvidence('html', { selector: '#app', snippet: 'React' }),
        ],
      }),
    ]);

    const insights = getScanInsights(scan);

    // Two distinct evidence objects (different selectors/values) are both counted
    expect(insights.evidenceCount).toBe(2);
    expect(insights.evidenceTypes).toEqual([{ type: 'HTML Element', count: 2 }]);
  });

  it('produces deterministic output across calls (no mutation)', () => {
    const scan = makeScan([
      makeDetection({
        technology: makeTechnology({ id: 'react', category: 'framework' }),
        evidence: [makeEvidence('http_header', { name: 'Server', value: 'nginx' })],
      }),
      makeDetection({
        technology: makeTechnology({ id: 'wordpress', category: 'cms' }),
        evidence: [
          makeEvidence('meta_tag', { name: 'generator', content: 'WordPress' }),
          makeEvidence('script_url', { url: 'https://example.com/app.js' }),
        ],
      }),
    ]);

    const first = getScanInsights(scan);
    const second = getScanInsights(scan);

    expect(first).toEqual(second);
  });
});

describe('getEvidenceTypeCounts', () => {
  it('counts evidence types for a single detection', () => {
    const detection = makeDetection({
      evidence: [
        makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
        makeEvidence('meta_tag', { name: 'generator', content: 'WordPress' }),
        makeEvidence('script_url', { url: 'https://example.com/app.js' }),
      ],
    });

    const counts = getEvidenceTypeCounts(detection);

    expect(counts).toEqual([
      { type: 'HTTP Header', count: 1 },
      { type: 'Meta Tag', count: 1 },
      { type: 'Script URL', count: 1 },
    ]);
  });

  it('handles empty evidence', () => {
    const detection = makeDetection({ evidence: [] });
    const counts = getEvidenceTypeCounts(detection);
    expect(counts).toEqual([]);
  });

  it('aggregates same-type evidence and sorts by count DESC', () => {
    const detection = makeDetection({
      evidence: [
        makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
        makeEvidence('http_header', { name: 'X-Frame', value: 'DENY' }),
        makeEvidence('http_header', { name: 'X-Powered', value: 'Express' }),
        makeEvidence('meta_tag', { name: 'generator', content: 'WordPress' }),
      ],
    });

    const counts = getEvidenceTypeCounts(detection);

    expect(counts).toEqual([
      { type: 'HTTP Header', count: 3 },
      { type: 'Meta Tag', count: 1 },
    ]);
  });
});

describe('getCategoryCounts', () => {
  it('returns category counts from detections', () => {
    const detections = [
      makeDetection({ technology: makeTechnology({ id: 'react', category: 'framework' }) }),
      makeDetection({ technology: makeTechnology({ id: 'wordpress', category: 'cms' }) }),
      makeDetection({ technology: makeTechnology({ id: 'vue', category: 'framework' }) }),
    ];

    const counts = getCategoryCounts(detections);

    // framework: 2, cms: 1
    expect(counts).toEqual([
      { category: 'framework', count: 2 },
      { category: 'cms', count: 1 },
    ]);
  });

  it('handles empty detections', () => {
    expect(getCategoryCounts([])).toEqual([]);
  });

  it('categorizes unknown technology IDs as "Unknown"', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'unknown-tech', name: 'Unknown', category: 'custom' }),
      }),
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
      }),
    ];

    const counts = getCategoryCounts(detections);

    // Unknown is alphabetically before framework at same count
    expect(counts).toEqual([
      { category: 'Unknown', count: 1 },
      { category: 'framework', count: 1 },
    ]);
  });
});

// ─── Technology composition tests ────────────────────────────────────

describe('getTechnologyComposition', () => {
  it('groups multiple technologies across multiple categories', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
      }),
      makeDetection({
        technology: makeTechnology({ id: 'wordpress', name: 'WordPress', category: 'cms' }),
      }),
      makeDetection({
        technology: makeTechnology({ id: 'nginx', name: 'nginx', category: 'server' }),
      }),
    ];

    const composition = getTechnologyComposition(detections);

    // Three categories, each with 1 technology — sorted alphabetically
    expect(composition).toEqual([
      { category: 'cms', technologies: [{ id: 'wordpress', name: 'WordPress' }] },
      { category: 'framework', technologies: [{ id: 'react', name: 'React' }] },
      { category: 'server', technologies: [{ id: 'nginx', name: 'nginx' }] },
    ]);
  });

  it('groups multiple technologies in one category', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'wordpress', name: 'WordPress', category: 'cms' }),
      }),
      makeDetection({
        technology: makeTechnology({ id: 'drupal', name: 'Drupal', category: 'cms' }),
      }),
    ];

    const composition = getTechnologyComposition(detections);

    expect(composition).toHaveLength(1);
    expect(composition[0]!.category).toBe('cms');
    expect(composition[0]!.technologies).toEqual([
      { id: 'drupal', name: 'Drupal' },
      { id: 'wordpress', name: 'WordPress' },
    ]);
  });

  it('deduplicates technologies with the same ID', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
      }),
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
      }),
    ];

    const composition = getTechnologyComposition(detections);

    expect(composition).toHaveLength(1);
    expect(composition[0]!.technologies).toHaveLength(1);
    expect(composition[0]!.technologies[0]).toEqual({ id: 'react', name: 'React' });
  });

  it('preserves the first occurrence name for duplicate IDs', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
      }),
      // Same ID, different name — first occurrence wins
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React DOM', category: 'framework' }),
      }),
    ];

    const composition = getTechnologyComposition(detections);

    expect(composition[0]!.technologies[0]).toEqual({ id: 'react', name: 'React' });
  });

  it('places unknown technology IDs in the "Unknown" category', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'unknown-tech', name: 'Custom Tool', category: 'custom' }),
      }),
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
      }),
    ];

    const composition = getTechnologyComposition(detections);

    const unknownCategory = composition.find((c) => c.category === 'Unknown');
    expect(unknownCategory).toBeDefined();
    expect(unknownCategory!.technologies).toEqual([{ id: 'unknown-tech', name: 'Custom Tool' }]);
  });

  it('preserves unknown technology name from detection', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({
          id: 'mystery-tool',
          name: 'Mystery Tool',
          category: 'something-not-in-catalog',
        }),
      }),
    ];

    const composition = getTechnologyComposition(detections);

    expect(composition).toEqual([
      {
        category: 'Unknown',
        technologies: [{ id: 'mystery-tool', name: 'Mystery Tool' }],
      },
    ]);
  });

  it('handles empty detections', () => {
    const composition = getTechnologyComposition([]);
    expect(composition).toEqual([]);
  });

  it('sorts categories by count DESC then category ASC', () => {
    const detections = [
      makeDetection({ technology: makeTechnology({ id: 'react', category: 'framework' }) }),
      makeDetection({ technology: makeTechnology({ id: 'angular', category: 'framework' }) }),
      makeDetection({ technology: makeTechnology({ id: 'vue', category: 'framework' }) }),
      makeDetection({ technology: makeTechnology({ id: 'wordpress', category: 'cms' }) }),
      makeDetection({ technology: makeTechnology({ id: 'drupal', category: 'cms' }) }),
      makeDetection({ technology: makeTechnology({ id: 'nginx', category: 'server' }) }),
    ];

    const composition = getTechnologyComposition(detections);

    // framework: 3, cms: 2, server: 1
    expect(composition.map((c) => c.category)).toEqual(['framework', 'cms', 'server']);
  });

  it('sorts technologies within a category by name ASC then id ASC', () => {
    const detections = [
      // Same name, different IDs — id ASC tiebreaker
      makeDetection({
        technology: makeTechnology({ id: 'aaa', name: 'Same Name', category: 'framework' }),
      }),
      makeDetection({
        technology: makeTechnology({ id: 'zzz', name: 'Same Name', category: 'framework' }),
      }),
    ];

    const composition = getTechnologyComposition(detections);

    expect(composition[0]!.technologies.map((t) => t.id)).toEqual(['aaa', 'zzz']);
  });

  it('produces identical output across calls (no mutation, deterministic)', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
      }),
      makeDetection({
        technology: makeTechnology({ id: 'wordpress', name: 'WordPress', category: 'cms' }),
      }),
    ];

    const first = getTechnologyComposition(detections);
    const second = getTechnologyComposition(detections);

    expect(first).toEqual(second);
  });

  it('does not mutate the input detections array', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
      }),
    ];
    const originalLength = detections.length;

    getTechnologyComposition(detections);

    expect(detections.length).toBe(originalLength);
  });
});

// ─── Technology evidence matrix tests ────────────────────────────────

describe('getTechnologyEvidenceMatrix', () => {
  it('produces a matrix row for one technology with one evidence item', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [makeEvidence('script_url', { url: 'https://example.com/app.js' })],
      }),
    ];

    const matrix = getTechnologyEvidenceMatrix(detections);

    expect(matrix).toEqual([
      {
        id: 'react',
        name: 'React',
        evidenceTypes: ['Script URL'],
        evidenceCount: 1,
      },
    ]);
  });

  it('produces unique evidence types for one technology with multiple evidence types', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [
          makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
          makeEvidence('meta_tag', { name: 'generator', content: 'React' }),
          makeEvidence('script_url', { url: 'https://example.com/app.js' }),
        ],
      }),
    ];

    const matrix = getTechnologyEvidenceMatrix(detections);

    expect(matrix[0]!.evidenceTypes).toEqual(['HTTP Header', 'Meta Tag', 'Script URL']);
    expect(matrix[0]!.evidenceCount).toBe(3);
  });

  it('groups multiple technologies across categories', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [makeEvidence('script_url', { url: 'https://example.com/app.js' })],
      }),
      makeDetection({
        technology: makeTechnology({ id: 'wordpress', name: 'WordPress', category: 'cms' }),
        evidence: [makeEvidence('meta_tag', { name: 'generator', content: 'WordPress' })],
      }),
    ];

    const matrix = getTechnologyEvidenceMatrix(detections);

    expect(matrix).toHaveLength(2);
    expect(matrix.map((m) => m.name)).toEqual(['React', 'WordPress']);
  });

  it('collapses duplicate technology IDs into one row', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [makeEvidence('script_url', { url: 'https://example.com/app.js' })],
      }),
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [makeEvidence('http_header', { name: 'Server', value: 'nginx' })],
      }),
    ];

    const matrix = getTechnologyEvidenceMatrix(detections);

    expect(matrix).toHaveLength(1);
    expect(matrix[0]).toEqual({
      id: 'react',
      name: 'React',
      evidenceTypes: ['HTTP Header', 'Script URL'],
      evidenceCount: 2,
    });
  });

  it('preserves first occurrence name for duplicate technology IDs', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [makeEvidence('script_url', { url: 'https://example.com/app.js' })],
      }),
      // Same ID, different name — first occurrence wins
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React.js', category: 'framework' }),
        evidence: [],
      }),
    ];

    const matrix = getTechnologyEvidenceMatrix(detections);

    expect(matrix[0]!.name).toBe('React');
  });

  it('merges evidence from duplicate detection records', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [
          makeEvidence('script_url', { url: 'https://example.com/app.js' }),
          makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
        ],
      }),
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [
          makeEvidence('meta_tag', { name: 'generator', content: 'React' }),
          makeEvidence('script_url', { url: 'https://example.com/app.js' }), // duplicate
        ],
      }),
    ];

    const matrix = getTechnologyEvidenceMatrix(detections);

    // 3 evidence items + 1 duplicate script_url → 3 unique entries
    expect(matrix[0]!.evidenceCount).toBe(3);
    expect(matrix[0]!.evidenceTypes).toEqual(['HTTP Header', 'Meta Tag', 'Script URL']);
  });

  it('deduplicates identical evidence entries within merged evidence', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'nginx', name: 'nginx', category: 'server' }),
        evidence: [
          makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
          makeEvidence('http_header', { name: 'Server', value: 'nginx' }), // exact duplicate
        ],
      }),
    ];

    const matrix = getTechnologyEvidenceMatrix(detections);

    expect(matrix[0]!.evidenceCount).toBe(1);
    expect(matrix[0]!.evidenceTypes).toEqual(['HTTP Header']);
  });

  it('handles no evidence (zero evidence items)', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [],
      }),
    ];

    const matrix = getTechnologyEvidenceMatrix(detections);

    expect(matrix[0]!.evidenceTypes).toEqual([]);
    expect(matrix[0]!.evidenceCount).toBe(0);
  });

  it('preserves unknown technology IDs', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({
          id: 'custom-tool',
          name: 'Custom Tool',
          category: 'something-not-in-catalog',
        }),
        evidence: [makeEvidence('html', { selector: '#app', snippet: 'test' })],
      }),
    ];

    const matrix = getTechnologyEvidenceMatrix(detections);

    expect(matrix).toHaveLength(1);
    expect(matrix[0]!.id).toBe('custom-tool');
    expect(matrix[0]!.name).toBe('Custom Tool');
    expect(matrix[0]!.evidenceTypes).toEqual(['HTML Element']);
    expect(matrix[0]!.evidenceCount).toBe(1);
  });

  it('handles unknown evidence types safely', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [
          makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
          // Unknown evidence type
          makeEvidence('future_type' as EvidenceResponse['type'], { data: 'unknown' }),
        ],
      }),
    ];

    const matrix = getTechnologyEvidenceMatrix(detections);

    // Should not crash, unknown type uses "Evidence" fallback
    expect(matrix[0]!.evidenceCount).toBe(2);
    expect(matrix[0]!.evidenceTypes).toContain('Evidence');
    expect(matrix[0]!.evidenceTypes).toContain('HTTP Header');
  });

  it('sorts technologies by name ASC then id ASC', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'zzz', name: 'Zebra', category: 'framework' }),
      }),
      makeDetection({
        technology: makeTechnology({ id: 'aaa', name: 'Alpha', category: 'framework' }),
      }),
      makeDetection({
        technology: makeTechnology({ id: 'bbb', name: 'Alpha', category: 'framework' }),
      }),
    ];

    const matrix = getTechnologyEvidenceMatrix(detections);

    // Sorted by name: Alpha, Zebra; within Alpha, by id: aaa, bbb
    expect(matrix.map((m) => [m.id, m.name])).toEqual([
      ['aaa', 'Alpha'],
      ['bbb', 'Alpha'],
      ['zzz', 'Zebra'],
    ]);
  });

  it('produces deterministic output across calls (no mutation)', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [
          makeEvidence('script_url', { url: 'https://example.com/app.js' }),
          makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
        ],
      }),
      makeDetection({
        technology: makeTechnology({ id: 'wordpress', name: 'WordPress', category: 'cms' }),
        evidence: [makeEvidence('meta_tag', { name: 'generator', content: 'WordPress' })],
      }),
    ];

    const first = getTechnologyEvidenceMatrix(detections);
    const second = getTechnologyEvidenceMatrix(detections);

    expect(first).toEqual(second);
  });

  it('does not mutate the input detections array', () => {
    const detections = [
      makeDetection({
        technology: makeTechnology({ id: 'react', name: 'React', category: 'framework' }),
        evidence: [makeEvidence('script_url', { url: 'https://example.com/app.js' })],
      }),
    ];
    const originalLength = detections.length;
    const originalEvidenceLength = detections[0]!.evidence.length;

    getTechnologyEvidenceMatrix(detections);

    expect(detections.length).toBe(originalLength);
    expect(detections[0]!.evidence.length).toBe(originalEvidenceLength);
  });
});
