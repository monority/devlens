/**
 * Unit tests for the DetectionFilters presentation component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment
 * required. `next/link` is not used by this component.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DetectionFilters } from './DetectionFilters';

const noop = () => {};

function makeProps(overrides: Partial<DetectionFiltersProps> = {}): DetectionFiltersProps {
  return {
    search: '',
    category: '',
    categories: ['framework', 'cms', 'server'],
    resultCount: 5,
    totalDetections: 5,
    onSearchChange: noop,
    onCategoryChange: noop,
    onReset: noop,
    ...overrides,
  };
}

interface DetectionFiltersProps {
  search: string;
  category: string;
  categories: string[];
  resultCount: number;
  totalDetections: number;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onReset: () => void;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('DetectionFilters', () => {
  it('renders the search input with an associated label', () => {
    const html = renderToString(React.createElement(DetectionFilters, makeProps()));

    expect(html).toContain('Search technologies');
    expect(html).toContain('id="detection-search"');
    expect(html).toContain('type="search"');
    expect(html).toContain('placeholder="react, nginx, cms..."');
  });

  it('renders the category select with an associated label', () => {
    const html = renderToString(React.createElement(DetectionFilters, makeProps()));

    expect(html).toContain('Category');
    expect(html).toContain('id="detection-category"');
    expect(html).toContain('value=""');
  });

  it('renders all categories as options', () => {
    const html = renderToString(
      React.createElement(
        DetectionFilters,
        makeProps({ categories: ['framework', 'cms', 'server'] }),
      ),
    );

    expect(html).toContain('framework');
    expect(html).toContain('cms');
    expect(html).toContain('server');
  });

  it('shows "All" as the first category option', () => {
    const html = renderToString(React.createElement(DetectionFilters, makeProps()));

    expect(html).toContain('>All<');
  });

  it('renders the result count', () => {
    const html = renderToString(
      React.createElement(DetectionFilters, makeProps({ resultCount: 3, totalDetections: 5 })),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('3 of 5 detections');
  });

  it('shows "N detections" when no filters are active and all match', () => {
    const html = renderToString(
      React.createElement(DetectionFilters, makeProps({ resultCount: 5, totalDetections: 5 })),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('5 detections');
  });

  it('renders the reset button when filters are active', () => {
    const html = renderToString(
      React.createElement(DetectionFilters, makeProps({ search: 'react', category: '' })),
    );

    expect(html).toContain('Reset filters');
  });

  it('does not render the reset button when no filters are active', () => {
    const html = renderToString(React.createElement(DetectionFilters, makeProps()));

    expect(html).not.toContain('Reset filters');
  });

  it('renders "No detections match these filters." for empty filtered state', () => {
    const html = renderToString(
      React.createElement(
        DetectionFilters,
        makeProps({ search: 'nonexistent', resultCount: 0, totalDetections: 5 }),
      ),
    );

    expect(html).toContain('No detections match these filters.');
  });

  it('does not render empty-filtered state when totalDetections is zero', () => {
    const html = renderToString(
      React.createElement(DetectionFilters, makeProps({ resultCount: 0, totalDetections: 0 })),
    );

    expect(html).not.toContain('No detections match these filters.');
  });

  it('shows descriptive match text when search is active', () => {
    const html = renderToString(
      React.createElement(
        DetectionFilters,
        makeProps({ search: 'react', resultCount: 1, totalDetections: 5 }),
      ),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('1 of 5');
  });
});
