/**
 * Unit tests for the HomeDashboard pure presentation component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment
 * required, consistent with the existing node-based test setup.
 *
 * `next/link` is mocked to render a plain `<a>` tag, since `ScanCard`
 * (rendered inside HomeDashboard) also uses `next/link`.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { HomeDashboard } from './HomeDashboard.js';
import type { ScanSummary } from '../lib/types.js';
import type { TechnologyPresentation } from '../lib/technology-catalog.js';

// Mock next/link to render a plain <a> tag (no router context needed)
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// ─── Test fixtures ───────────────────────────────────────────────────

function makeScan(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    id: 'scan_001',
    status: 'completed',
    target: 'https://example.com/',
    hostname: 'example.com',
    createdAt: '2025-06-01T12:00:00.000Z',
    startedAt: null,
    completedAt: '2025-06-01T12:00:05.000Z',
    failedAt: null,
    error: null,
    ...overrides,
  };
}

function makeTech(overrides: Partial<TechnologyPresentation> = {}): TechnologyPresentation {
  return {
    id: 'nginx',
    name: 'nginx',
    category: 'server',
    description: 'High-performance web server',
    ...overrides,
  };
}

// ─── 1. DevLens introduction ────────────────────────────────────────

describe('HomeDashboard — introduction', () => {
  it('renders the DevLens introduction text', () => {
    const html = renderToString(
      React.createElement(HomeDashboard, { scans: [], technologies: [] }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('DevLens');
    expect(cleaned).toContain('Analyze a website');
    expect(cleaned).toContain('detect its technologies');
    expect(cleaned).toContain('evidence behind every detection');
  });
});

// ─── 2-4. Quick action links ────────────────────────────────────────

describe('HomeDashboard — quick actions', () => {
  it('renders a Scan History link to /scans', () => {
    const html = renderToString(
      React.createElement(HomeDashboard, { scans: [], technologies: [] }),
    );

    expect(html).toContain('href="/scans"');
    expect(html).toContain('Scan History');
  });

  it('renders a Technology Catalog link to /technologies', () => {
    const html = renderToString(
      React.createElement(HomeDashboard, { scans: [], technologies: [] }),
    );

    expect(html).toContain('href="/technologies"');
    expect(html).toContain('Technology Catalog');
  });

  it('renders a New Scan link to /scans/new since the route exists', () => {
    const html = renderToString(
      React.createElement(HomeDashboard, { scans: [], technologies: [] }),
    );

    expect(html).toContain('href="/scans/new"');
    expect(html).toContain('New Scan');
  });
});

// ─── 5-8. Recent scans ──────────────────────────────────────────────

describe('HomeDashboard — recent scans', () => {
  it('renders recent scans with ScanCard content (target, hostname, detail link)', () => {
    const scans: ScanSummary[] = [
      makeScan({
        id: 'scan_001',
        target: 'https://example.com/',
        hostname: 'example.com',
        status: 'completed',
      }),
    ];
    const html = renderToString(React.createElement(HomeDashboard, { scans, technologies: [] }));

    expect(html).toContain('https://example.com/');
    expect(html).toContain('example.com');
    expect(html).toContain('View details');
    expect(html).toContain('href="/scans/scan_001"');
  });

  it('renders at most five recent scans when more are available', () => {
    const scans: ScanSummary[] = Array.from({ length: 7 }, (_, i) =>
      makeScan({
        id: `scan_${i}`,
        target: `https://site${i}.com/`,
        hostname: `site${i}.com`,
      }),
    );
    const html = renderToString(React.createElement(HomeDashboard, { scans, technologies: [] }));
    const cleaned = html.replace(/<!-- -->/g, '');

    const viewDetailsCount = (cleaned.match(/View details/g) || []).length;
    expect(viewDetailsCount).toBe(5);
  });

  it('renders a "View all" link when more than 5 scans exist', () => {
    const scans: ScanSummary[] = Array.from({ length: 8 }, (_, i) => makeScan({ id: `scan_${i}` }));
    const html = renderToString(React.createElement(HomeDashboard, { scans, technologies: [] }));

    expect(html).toContain('View all');
  });

  it('does not render a "View all scans" link when 5 or fewer scans exist', () => {
    const scans: ScanSummary[] = Array.from({ length: 5 }, (_, i) => makeScan({ id: `scan_${i}` }));
    const html = renderToString(React.createElement(HomeDashboard, { scans, technologies: [] }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // "View all N scans →" only appears when there are more than 5 scans.
    // (The "View all technologies →" link is separate and does NOT contain "scans".)
    expect(cleaned).not.toMatch(/View all \d+ scans/);
  });

  it('preserves scan order (newest first) from the API result', () => {
    const scans: ScanSummary[] = [
      makeScan({
        id: 'newer',
        target: 'https://new.example.com/',
        hostname: 'new.example.com',
        createdAt: '2025-06-03T00:00:00.000Z',
      }),
      makeScan({
        id: 'older',
        target: 'https://old.example.com/',
        hostname: 'old.example.com',
        createdAt: '2025-06-01T00:00:00.000Z',
      }),
    ];
    const html = renderToString(React.createElement(HomeDashboard, { scans, technologies: [] }));

    const newerPos = html.indexOf('new.example.com');
    const olderPos = html.indexOf('old.example.com');

    expect(newerPos).toBeGreaterThanOrEqual(0);
    expect(olderPos).toBeGreaterThanOrEqual(0);
    expect(newerPos).toBeLessThan(olderPos);
  });

  it('renders an empty state when there are no scans', () => {
    const html = renderToString(
      React.createElement(HomeDashboard, { scans: [], technologies: [] }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('No scans yet');
    expect(cleaned).toContain('Create your first scan');
  });

  it('renders an error message when the scans fetch failed (null)', () => {
    const html = renderToString(
      React.createElement(HomeDashboard, { scans: null, technologies: [] }),
    );

    expect(html).toContain('Unable to load scan history');
  });
});

// ─── 9-10. Technology catalog summary ───────────────────────────────

describe('HomeDashboard — technology catalog summary', () => {
  it('renders the total technology count', () => {
    const technologies: TechnologyPresentation[] = [
      makeTech({ id: 'nginx', name: 'nginx', category: 'server' }),
      makeTech({ id: 'react', name: 'React', category: 'framework' }),
      makeTech({ id: 'vue', name: 'Vue', category: 'framework' }),
    ];
    const html = renderToString(React.createElement(HomeDashboard, { scans: [], technologies }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('3 technologies');
  });

  it('renders category distribution with correct counts', () => {
    const technologies: TechnologyPresentation[] = [
      makeTech({ id: 'nginx', name: 'nginx', category: 'server' }),
      makeTech({ id: 'apache', name: 'Apache', category: 'server' }),
      makeTech({ id: 'react', name: 'React', category: 'framework' }),
      makeTech({ id: 'vue', name: 'Vue', category: 'framework' }),
      makeTech({ id: 'wordpress', name: 'WordPress', category: 'cms' }),
    ];
    const html = renderToString(React.createElement(HomeDashboard, { scans: [], technologies }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Each category that exists in the catalog should appear
    expect(html).toContain('server');
    expect(html).toContain('framework');
    expect(html).toContain('cms');

    // Count values should appear (2 servers, 2 frameworks, 1 cms)
    expect(cleaned).toContain('>2<');
    expect(cleaned).toContain('>1<');
  });
});

// ─── 11. No fake data ───────────────────────────────────────────────

describe('HomeDashboard — no fake data', () => {
  it('renders only the data passed as props, not hardcoded values', () => {
    const scans: ScanSummary[] = [
      makeScan({
        id: 'FAKE_SCAN_ID',
        target: 'https://fake.test/',
        hostname: 'fake.test',
      }),
    ];
    const technologies: TechnologyPresentation[] = [
      makeTech({ id: 'FAKE_TECH', name: 'FakeTech', category: 'fake_category' }),
    ];
    const html = renderToString(React.createElement(HomeDashboard, { scans, technologies }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Scan data from props should appear
    expect(html).toContain('FAKE_SCAN_ID');
    expect(html).toContain('https://fake.test/');
    expect(html).toContain('fake.test');

    // Category from the technology catalog summary should appear
    expect(html).toContain('fake_category');

    // Technology count should reflect only the props data
    expect(cleaned).toContain('1 technologies');

    // No hardcoded scan data from test fixtures
    expect(html).not.toContain('scan_001');
    expect(html).not.toContain('example.com');
  });
});

// ─── Semantic structure ─────────────────────────────────────────────

describe('HomeDashboard — semantic structure', () => {
  it('uses a single h1 for the page title', () => {
    const html = renderToString(
      React.createElement(HomeDashboard, { scans: [], technologies: [] }),
    );

    const h1Count = (html.match(/<h1/g) || []).length;
    expect(h1Count).toBe(1);
  });

  it('uses h2 for section headings', () => {
    const html = renderToString(
      React.createElement(HomeDashboard, { scans: [], technologies: [] }),
    );

    // Should have h2 elements for section titles (Get started, Recent scans, Technology catalog)
    const h2Count = (html.match(/<h2/g) || []).length;
    expect(h2Count).toBe(3);
  });

  it('renders all three quick action links', () => {
    const html = renderToString(
      React.createElement(HomeDashboard, { scans: [], technologies: [] }),
    );

    expect(html).toContain('href="/scans/new"');
    expect(html).toContain('href="/scans"');
    expect(html).toContain('href="/technologies"');
  });
});
