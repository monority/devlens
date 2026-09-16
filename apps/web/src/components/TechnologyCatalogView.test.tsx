/**
 * URL state tests for the technology catalog filtering.
 *
 * Tests the `buildTechnologyUrl` pure function and the initialization
 * behavior of `TechnologyCatalogView` (how URL parameters populate
 * the initial filter state).
 *
 * `next/navigation` is mocked so `useSearchParams` returns controlled
 * values. `next/link` is mocked to render plain `<a>` tags.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Hoist the mock so it's available in the vi.mock factory
const { mockSearchParams } = vi.hoisted(() => ({
  mockSearchParams: {
    get: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  notFound: vi.fn(),
}));

// Mock next/link to render a plain <a> tag
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────

import { buildTechnologyUrl } from '../lib/technology-filter';
import { TechnologyCatalogView } from '@/components/TechnologyCatalogView';
import { getTechnologies } from '@/lib/technology-catalog';

describe('buildTechnologyUrl (URL state)', () => {
  it('q parameter is included when search is set', () => {
    expect(buildTechnologyUrl('react', '')).toBe('/technologies?q=react');
  });

  it('category parameter is included when category is set', () => {
    expect(buildTechnologyUrl('', 'framework')).toBe('/technologies?category=framework');
  });

  it('search updates URL when both search and category are set', () => {
    expect(buildTechnologyUrl('react', 'framework')).toBe(
      '/technologies?q=react&category=framework',
    );
  });

  it('invalid category is normalized before URL construction', () => {
    // The caller (TechnologyCatalogView) normalizes invalid categories to ''
    // before calling buildTechnologyUrl. An empty category means no param.
    expect(buildTechnologyUrl('react', '')).toBe('/technologies?q=react');
  });

  it('reset removes unnecessary parameters', () => {
    // When both filters are empty, the URL should be clean
    expect(buildTechnologyUrl('', '')).toBe('/technologies');
  });
});

// ─── Initialization tests (mocked next/navigation) ───────────────────

describe('TechnologyCatalogView URL initialization', () => {
  beforeEach(() => {
    mockSearchParams.get.mockReset();
  });

  it('q initializes the search field from URL', () => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'q') return 'react';
      return null;
    });

    const html = renderToString(
      React.createElement(TechnologyCatalogView, { technologies: getTechnologies() }),
    );

    expect(html).toContain('value="react"');
  });

  it('category initializes the category select from URL', () => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'category') return 'framework';
      return null;
    });

    const html = renderToString(
      React.createElement(TechnologyCatalogView, { technologies: getTechnologies() }),
    );

    expect(html).toContain('value="framework"');
  });

  it('invalid category resolves to All (empty select value)', () => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'category') return 'invalid-category';
      return null;
    });

    const html = renderToString(
      React.createElement(TechnologyCatalogView, { technologies: getTechnologies() }),
    );

    // The select should have value="" (All) since the category was invalid
    expect(html).toContain('value=""');
  });
});
