/**
 * Unit tests for the ScanFilters presentation component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment
 * (jsdom) required. Tests focus on what is rendered in the HTML output.
 *
 * `next/link` is mocked to render a plain `<a>` tag, since the Next.js
 * router context is not available in the node test environment.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Mock next/link to render a plain <a> tag
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

import { ScanFilters } from './ScanFilters.js';

const noop = () => {};

// ─── Tests ───────────────────────────────────────────────────────────

describe('ScanFilters', () => {
  it('renders the search field with associated label', () => {
    const html = renderToString(
      React.createElement(ScanFilters, {
        search: '',
        status: '',
        resultCount: 5,
        totalScans: 5,
        onSearchChange: noop,
        onStatusChange: noop,
        onReset: noop,
      }),
    );

    expect(html).toContain('Search scans');
    expect(html).toContain('id="scan-search"');
    expect(html).toContain('type="search"');
    expect(html).toContain('placeholder="example.com"');
  });

  it('renders the status selector with all five options', () => {
    const html = renderToString(
      React.createElement(ScanFilters, {
        search: '',
        status: '',
        resultCount: 5,
        totalScans: 5,
        onSearchChange: noop,
        onStatusChange: noop,
        onReset: noop,
      }),
    );

    expect(html).toContain('Status');
    expect(html).toContain('id="scan-status"');
    expect(html).toContain('value=""');
    expect(html).toContain('Pending');
    expect(html).toContain('Running');
    expect(html).toContain('Completed');
    expect(html).toContain('Failed');
  });

  it('renders the result count', () => {
    const html = renderToString(
      React.createElement(ScanFilters, {
        search: '',
        status: '',
        resultCount: 12,
        totalScans: 12,
        onSearchChange: noop,
        onStatusChange: noop,
        onReset: noop,
      }),
    );

    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('12 scans');
  });

  it('renders empty state when no scans exist', () => {
    const html = renderToString(
      React.createElement(ScanFilters, {
        search: '',
        status: '',
        resultCount: 0,
        totalScans: 0,
        onSearchChange: noop,
        onStatusChange: noop,
        onReset: noop,
      }),
    );

    expect(html).toContain('No scans yet.');
    expect(html).toContain('New scan →');
    expect(html).toContain('href="/scans/new"');
  });

  it('renders reset button when filters are active and no matches', () => {
    const html = renderToString(
      React.createElement(ScanFilters, {
        search: 'nonexistent.com',
        status: 'completed',
        resultCount: 0,
        totalScans: 5,
        onSearchChange: noop,
        onStatusChange: noop,
        onReset: noop,
      }),
    );

    expect(html).toContain('No scans match the current filters.');
    expect(html).toContain('Reset filters');
  });

  it('preserves links to scan detail pages and navigation', () => {
    const html = renderToString(
      React.createElement(ScanFilters, {
        search: '',
        status: '',
        resultCount: 0,
        totalScans: 0,
        onSearchChange: noop,
        onStatusChange: noop,
        onReset: noop,
      }),
    );

    // "New scan" link should point to /scans/new
    expect(html).toContain('href="/scans/new"');
  });
});
