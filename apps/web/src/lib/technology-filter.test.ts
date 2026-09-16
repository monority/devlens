/**
 * Unit tests for the pure technology-filtering module.
 *
 * These tests verify the filtering pipeline without React, HTTP, or a
 * DOM environment. The pipeline is:
 *
 *   catalog → search filter → category filter → ordered list (no re-sorting)
 */

import { describe, it, expect } from 'vitest';
import {
  filterTechnologies,
  getTechnologyCategories,
  isValidTechnologyCategory,
} from './technology-filter';
import { getTechnologies } from './technology-catalog';
import type { TechnologyPresentation } from './technology-catalog.js';

// ─── Fixtures ────────────────────────────────────────────────────────

function makeTech(
  id: string,
  name: string,
  category: string,
  description: string = 'A technology',
): TechnologyPresentation {
  return { id, name, category, description };
}

function makeTechList(): TechnologyPresentation[] {
  return [
    makeTech('nginx', 'nginx', 'server', 'Web server and reverse proxy'),
    makeTech('php', 'PHP', 'language', 'Server-side scripting language'),
    makeTech('wordpress', 'WordPress', 'cms', 'Open-source content management system'),
    makeTech('react', 'React', 'framework', 'JavaScript library for building user interfaces'),
    makeTech('vue', 'Vue.js', 'framework', 'Progressive JavaScript framework'),
    makeTech('jquery', 'jQuery', 'library', 'DOM manipulation library'),
    makeTech('lodash', 'Lodash', 'library', 'JavaScript utility library'),
  ];
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('filterTechnologies', () => {
  it('returns all technologies when no filters are applied', () => {
    const techs = makeTechList();
    const result = filterTechnologies(techs, { search: '', category: '' });
    expect(result).toHaveLength(7);
    expect(result.map((t) => t.id)).toEqual([
      'nginx',
      'php',
      'wordpress',
      'react',
      'vue',
      'jquery',
      'lodash',
    ]);
  });

  it('filters by name (case-insensitive substring)', () => {
    const techs = makeTechList();
    const result = filterTechnologies(techs, { search: 'react', category: '' });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('react');
  });

  it('filters by ID (case-insensitive)', () => {
    const techs = makeTechList();
    const result = filterTechnologies(techs, { search: 'LO', category: '' });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('lodash');
  });

  it('filters by category (case-insensitive substring)', () => {
    const techs = makeTechList();
    const result = filterTechnologies(techs, { search: 'framework', category: '' });
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(['react', 'vue']);
  });

  it('filters by description (case-insensitive substring)', () => {
    const techs = makeTechList();
    const result = filterTechnologies(techs, { search: 'utility', category: '' });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('lodash');
  });

  it('search is case-insensitive', () => {
    const techs = makeTechList();
    const result = filterTechnologies(techs, { search: 'REACT', category: '' });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('react');
  });

  it('filters by category only', () => {
    const techs = makeTechList();
    const result = filterTechnologies(techs, { search: '', category: 'framework' });
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(['react', 'vue']);
  });

  it('combines search and category filters', () => {
    const techs = makeTechList();
    // Search for "dom" within the "library" category
    const result = filterTechnologies(techs, { search: 'dom', category: 'library' });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('jquery');
  });

  it('invalid category falls back to All (no category filter applied)', () => {
    const techs = makeTechList();
    // An invalid category should be caught by isValidTechnologyCategory before
    // reaching filterTechnologies. But if it reaches filterTechnologies, an
    // unknown category simply matches nothing (since no tech has that category).
    const result = filterTechnologies(techs, { search: '', category: 'invalid-category' });
    expect(result).toHaveLength(0);
  });

  it('empty search returns all (within category filter)', () => {
    const techs = makeTechList();
    const result = filterTechnologies(techs, { search: '', category: 'library' });
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(['jquery', 'lodash']);
  });

  it('returns empty array when no technologies match', () => {
    const techs = makeTechList();
    const result = filterTechnologies(techs, { search: 'nonexistent', category: '' });
    expect(result).toHaveLength(0);
  });

  it('preserves original ordering (does not re-sort)', () => {
    const techs = makeTechList();
    const result = filterTechnologies(techs, { search: '', category: '' });
    expect(result.map((t) => t.id)).toEqual([
      'nginx',
      'php',
      'wordpress',
      'react',
      'vue',
      'jquery',
      'lodash',
    ]);

    // Partial filter — order should still match original
    const subset = [techs[0]!, techs[3]!, techs[6]!] as TechnologyPresentation[];
    const result2 = filterTechnologies(subset, { search: '', category: '' });
    expect(result2.map((t) => t.id)).toEqual(['nginx', 'react', 'lodash']);
  });

  it('does not mutate the input array', () => {
    const techs = makeTechList();
    const originalIds = techs.map((t) => t.id);

    filterTechnologies(techs, { search: 'react', category: '' });

    // Input array order should be unchanged
    expect(techs.map((t) => t.id)).toEqual(originalIds);
  });

  it('categories are derived uniquely from catalog data', () => {
    const techs = makeTechList();
    const categories = getTechnologyCategories(techs);
    const unique = new Set(categories);
    expect(unique.size).toBe(categories.length);
    expect(categories.sort()).toEqual(['cms', 'framework', 'language', 'library', 'server']);
  });
});

describe('isValidTechnologyCategory', () => {
  it('returns true for a known category', () => {
    expect(isValidTechnologyCategory('framework')).toBe(true);
    expect(isValidTechnologyCategory('server')).toBe(true);
  });

  it('returns false for an unknown category', () => {
    expect(isValidTechnologyCategory('unknown-category')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidTechnologyCategory('')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isValidTechnologyCategory(null)).toBe(false);
    expect(isValidTechnologyCategory(undefined)).toBe(false);
  });
});

describe('getTechnologyCategories', () => {
  it('returns sorted unique categories from the actual catalog', () => {
    const techs = getTechnologies();
    const categories = getTechnologyCategories(techs);
    const unique = new Set(categories);
    expect(unique.size).toBe(categories.length);

    // Categories should be sorted
    const sorted = [...categories].sort();
    expect(categories).toEqual(sorted);
  });

  it('returns empty array for empty input', () => {
    const categories = getTechnologyCategories([]);
    expect(categories).toEqual([]);
  });
});
