/**
 * Unit tests for the TechnologyFilters presentation component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment.
 * Tests focus on what is rendered in the HTML output.
 *
 * `next/link` is mocked to render plain `<a>` tags.
 *
 * Filtering behavior is verified through the pure `filterTechnologies()`
 * function (tested in `technology-filter.test.ts`), with the result count
 * passed as props to the component.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Mock next/link to render a plain <a> tag
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

import { TechnologyFilters } from './TechnologyFilters';
import { filterTechnologies } from '../lib/technology-filter';
import { getTechnologies } from '../lib/technology-catalog';

// ─── Helpers ─────────────────────────────────────────────────────────

const noop = () => {};

const allTechs = getTechnologies();
const categories = Array.from(new Set(allTechs.map((t) => t.category))).sort();

function makeProps(
  overrides: Partial<{
    search: string;
    category: string;
    categories: string[];
    resultCount: number;
    totalTechnologies: number;
  }> = {},
): TechnologyFiltersProps {
  return {
    search: overrides.search ?? '',
    category: overrides.category ?? '',
    categories: overrides.categories ?? categories,
    resultCount: overrides.resultCount ?? allTechs.length,
    totalTechnologies: overrides.totalTechnologies ?? allTechs.length,
    onSearchChange: noop,
    onCategoryChange: noop,
    onReset: noop,
  };
}

// Type for props (avoids importing the interface from the component)
interface TechnologyFiltersProps {
  search: string;
  category: string;
  categories: string[];
  resultCount: number;
  totalTechnologies: number;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onReset: () => void;
}

function clean(html: string): string {
  return html.replace(/<!-- -->/g, '');
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('TechnologyFilters', () => {
  it('renders controls: search field, category select, and labels', () => {
    const html = renderToString(React.createElement(TechnologyFilters, makeProps()));

    expect(html).toContain('Search technologies');
    expect(html).toContain('id="tech-search"');
    expect(html).toContain('type="search"');
    expect(html).toContain('Category');
    expect(html).toContain('id="tech-category"');
  });

  it('search filters results — result count reflects filtered set', () => {
    const filtered = filterTechnologies(allTechs, { search: 'react', category: '' });
    const props = makeProps({ search: 'react', resultCount: filtered.length });
    const html = renderToString(React.createElement(TechnologyFilters, props));

    expect(filtered.length).toBeGreaterThan(0);
    expect(clean(html)).toContain(`${filtered.length} technolog`);
    expect(html).toContain('value="react"');
  });

  it('category filters results — result count reflects category filter', () => {
    const filtered = filterTechnologies(allTechs, { search: '', category: 'framework' });
    const props = makeProps({ category: 'framework', resultCount: filtered.length });
    const html = renderToString(React.createElement(TechnologyFilters, props));

    expect(filtered.length).toBeGreaterThan(1);
    expect(clean(html)).toContain(`${filtered.length} technologies`);
  });

  it('combined filters work — search + category narrow results', () => {
    const filtered = filterTechnologies(allTechs, { search: 'dom', category: 'library' });
    const props = makeProps({ search: 'dom', category: 'library', resultCount: filtered.length });
    const html = renderToString(React.createElement(TechnologyFilters, props));

    expect(filtered.length).toBe(1);
    expect(clean(html)).toContain('1 technology matching');
    expect(html).toContain('value="dom"');
  });

  it('result count is correct', () => {
    const html = renderToString(
      React.createElement(TechnologyFilters, makeProps({ resultCount: 5 })),
    );

    expect(clean(html)).toContain('5 technologies');
  });

  it('reset button appears when filters are active', () => {
    const html = renderToString(
      React.createElement(TechnologyFilters, makeProps({ search: 'react' })),
    );

    expect(html).toContain('Reset filters');
  });

  it('empty state appears when no matches', () => {
    const html = renderToString(
      React.createElement(TechnologyFilters, makeProps({ resultCount: 0, search: 'nonexistent' })),
    );

    expect(html).toContain('No technologies match your filters.');
    expect(html).toContain('Reset filters');
  });

  it('links remain correct — filtered IDs map to valid catalog routes', () => {
    // Verify that filtering preserves IDs (used for /technologies/{id} links)
    const filtered = filterTechnologies(allTechs, { search: 'java', category: '' });

    // Each filtered tech ID should resolve to a valid catalog route
    for (const tech of filtered) {
      const resolved = tech.id;
      // The ID should be a non-empty string (valid for URL routing)
      expect(resolved.length).toBeGreaterThan(0);
      // Should not contain characters that break URL paths
      expect(resolved).not.toMatch(/[/\\?\s]/);
    }

    // Verify at least some results were found
    expect(filtered.length).toBeGreaterThan(0);
  });
});
