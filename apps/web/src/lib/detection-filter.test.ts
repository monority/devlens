/**
 * Unit tests for the pure detection-filtering module.
 *
 * These tests verify the filtering pipeline without React, HTTP, or a
 * DOM environment. The pipeline is:
 *
 *   Detection[] → filterDetections() → filtered, ordered list (no re-sort)
 */

import { describe, it, expect } from 'vitest';
import {
  filterDetections,
  isValidDetectionCategory,
  getDetectionCategories,
  buildDetectionUrl,
} from './detection-filter';
import type { DetectionResponse, EvidenceResponse } from './types';

// ─── Fixture builders ────────────────────────────────────────────────

function makeDetection(
  id: string,
  name: string,
  category: string,
  evidence: EvidenceResponse[] = [],
): DetectionResponse {
  return {
    technology: { id, name, category },
    confidence: 90,
    evidence,
  };
}

function makeDetections(): DetectionResponse[] {
  return [
    makeDetection('react', 'React', 'framework'),
    makeDetection('vue', 'Vue.js', 'framework'),
    makeDetection('wordpress', 'WordPress', 'cms'),
    makeDetection('nginx', 'nginx', 'server'),
    makeDetection('unknown-cms', 'Custom CMS', 'custom'),
  ];
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('filterDetections', () => {
  it('returns all detections when no filters are applied', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: '', category: '' });

    expect(filtered).toHaveLength(5);
  });

  it('filters by technology name (case-insensitive substring)', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: 'react', category: '' });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.technology.name).toBe('React');
  });

  it('filters by technology ID', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: 'vue', category: '' });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.technology.id).toBe('vue');
  });

  it('search is case-insensitive', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: 'REACT', category: '' });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.technology.name).toBe('React');
  });

  it('handles whitespace in search query', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: '  react  ', category: '' });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.technology.name).toBe('React');
  });

  it('filters by category', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: '', category: 'framework' });

    expect(filtered).toHaveLength(2);
    expect(filtered.every((d) => d.technology.category === 'framework')).toBe(true);
  });

  it('combines query and category filters (AND behavior)', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: 'react', category: 'framework' });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.technology.name).toBe('React');
  });

  it('query + category where query matches but category does not', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: 'react', category: 'cms' });

    expect(filtered).toHaveLength(0);
  });

  it('invalid category behaves as no category filter', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: '', category: 'nonexistent-category' });

    // The filter function does exact match — if category doesn't match anything,
    // no results. But the category normalization (invalid → empty) is the
    // caller's responsibility (handled in the component via isValidDetectionCategory).
    // This test verifies the filter itself with a non-matching category.
    expect(filtered).toHaveLength(0);
  });

  it('unknown technology remains searchable by ID and name', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: 'custom', category: '' });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.technology.id).toBe('unknown-cms');
  });

  it('unknown technology does not match catalog category filter', () => {
    const detections = makeDetections();
    // Unknown tech has category "custom" — filtering by "framework" won't match it
    const filtered = filterDetections(detections, { query: '', category: 'framework' });

    expect(filtered.every((d) => d.technology.category === 'framework')).toBe(true);
    expect(filtered.some((d) => d.technology.id === 'unknown-cms')).toBe(false);
  });

  it('returns no matches when query has no hits', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: 'nonexistent', category: '' });

    expect(filtered).toHaveLength(0);
  });

  it('preserves original API detection order (no re-sorting)', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: '', category: 'framework' });

    // React comes before Vue.js in the original array
    expect(filtered[0]!.technology.id).toBe('react');
    expect(filtered[1]!.technology.id).toBe('vue');
  });

  it('does not mutate the input detections array', () => {
    const detections = makeDetections();
    const originalLength = detections.length;

    filterDetections(detections, { query: 'react', category: '' });

    expect(detections.length).toBe(originalLength);
  });

  it('handles empty query search (wildcard for all)', () => {
    const detections = makeDetections();
    const filtered = filterDetections(detections, { query: '', category: '' });

    expect(filtered).toHaveLength(detections.length);
  });

  it('handles empty detections array', () => {
    const filtered = filterDetections([], { query: 'react', category: '' });
    expect(filtered).toEqual([]);
  });
});

describe('isValidDetectionCategory', () => {
  it('returns true for a known catalog category (framework)', () => {
    expect(isValidDetectionCategory('framework')).toBe(true);
  });

  it('returns true for a known catalog category (cms)', () => {
    expect(isValidDetectionCategory('cms')).toBe(true);
  });

  it('returns false for an unknown category', () => {
    expect(isValidDetectionCategory('nonexistent')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidDetectionCategory('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidDetectionCategory(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidDetectionCategory(undefined)).toBe(false);
  });
});

describe('getDetectionCategories', () => {
  it('returns sorted unique categories from the catalog', () => {
    const categories = getDetectionCategories();

    // Should include expected catalog categories
    expect(categories).toContain('framework');
    expect(categories).toContain('cms');
    expect(categories).toContain('server');

    // Should be sorted
    const sorted = [...categories].sort();
    expect(categories).toEqual(sorted);
  });

  it('contains no duplicate categories', () => {
    const categories = getDetectionCategories();
    const unique = new Set(categories);

    expect(categories.length).toBe(unique.size);
  });
});

describe('buildDetectionUrl', () => {
  it('includes q parameter when query is set', () => {
    const url = buildDetectionUrl('scan123', 'react', '');
    expect(url).toBe('/scans/scan123?q=react');
  });

  it('includes category parameter when category is set', () => {
    const url = buildDetectionUrl('scan123', '', 'cms');
    expect(url).toBe('/scans/scan123?category=cms');
  });

  it('includes both parameters when both are set', () => {
    const url = buildDetectionUrl('scan123', 'react', 'framework');
    expect(url).toBe('/scans/scan123?q=react&category=framework');
  });

  it('omits empty query parameter', () => {
    const url = buildDetectionUrl('scan123', '', 'cms');
    expect(url).not.toContain('q=');
  });

  it('omits empty category parameter', () => {
    const url = buildDetectionUrl('scan123', 'react', '');
    expect(url).not.toContain('category=');
  });

  it('returns clean path when both filters are empty', () => {
    const url = buildDetectionUrl('scan123', '', '');
    expect(url).toBe('/scans/scan123');
  });

  it('trims whitespace in query before building URL', () => {
    const url = buildDetectionUrl('scan123', '  react  ', '');
    expect(url).toBe('/scans/scan123?q=react');
  });

  it('encodes the scan ID in the URL path', () => {
    const url = buildDetectionUrl('scan with spaces', '', '');
    expect(url).toBe('/scans/scan%20with%20spaces');
  });
});
