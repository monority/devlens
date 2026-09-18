/**
 * Unit tests for the GlobalNav navigation component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment
 * required, consistent with the existing node-based test setup.
 *
 * `next/link` is mocked to render a plain `<a>` tag with all props
 * forwarded (href, className, aria-current).
 *
 * `next/navigation` is mocked so `usePathname` returns a controlled value
 * per test, following the `vi.hoisted()` pattern from
 * `DetectionFilterView.test.tsx`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Hoist the pathname mock so it is available in the vi.mock factory.
const { mockPathname } = vi.hoisted(() => ({
  mockPathname: { value: '/' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
}));

vi.mock('next/link', () => ({
  default: (props: {
    children: React.ReactNode;
    href: string;
    className?: string;
    'aria-current'?: string;
  }) => {
    const { children, ...rest } = props;
    return React.createElement('a', rest as Record<string, unknown>, children);
  },
}));

// ─── Imports (after mocks are set up) ────────────────────────────────

import { GlobalNav } from './GlobalNav.js';

// ─── Tests ───────────────────────────────────────────────────────────

describe('GlobalNav — links', () => {
  beforeEach(() => {
    mockPathname.value = '/';
  });

  it('renders a DevLens brand link to /', () => {
    const html = renderToString(React.createElement(GlobalNav));

    expect(html).toContain('href="/"');
    expect(html).toContain('DevLens');
  });

  it('renders a Scans link to /scans', () => {
    const html = renderToString(React.createElement(GlobalNav));

    expect(html).toContain('href="/scans"');
    expect(html).toContain('Scans');
  });

  it('renders a New Scan link to /scans/new', () => {
    const html = renderToString(React.createElement(GlobalNav));

    expect(html).toContain('href="/scans/new"');
    expect(html).toContain('New Scan');
  });

  it('renders a Technologies link to /technologies', () => {
    const html = renderToString(React.createElement(GlobalNav));

    expect(html).toContain('href="/technologies"');
    expect(html).toContain('Technologies');
  });
});

describe('GlobalNav — semantic structure', () => {
  beforeEach(() => {
    mockPathname.value = '/';
  });

  it('uses a <header> element for the nav container', () => {
    const html = renderToString(React.createElement(GlobalNav));

    expect(html).toContain('<header');
  });

  it('uses a <nav> element with aria-label="Primary"', () => {
    const html = renderToString(React.createElement(GlobalNav));

    expect(html).toContain('<nav');
    expect(html).toContain('aria-label="Primary"');
  });

  it('uses <ul>/<li> for the navigation list', () => {
    const html = renderToString(React.createElement(GlobalNav));

    expect(html).toContain('<ul');
    expect(html).toContain('<li');
  });

  it('renders all primary destinations exactly once', () => {
    const html = renderToString(React.createElement(GlobalNav));

    // Each href should appear exactly once
    const scansHrefCount = (html.match(/href="\/scans"/g) || []).length;
    expect(scansHrefCount).toBe(1);

    const newScanHrefCount = (html.match(/href="\/scans\/new"/g) || []).length;
    expect(newScanHrefCount).toBe(1);

    const techHrefCount = (html.match(/href="\/technologies"/g) || []).length;
    expect(techHrefCount).toBe(1);

    const homeHrefCount = (html.match(/href="\/"/g) || []).length;
    expect(homeHrefCount).toBe(1);
  });

  it('uses meaningful link text (no generic "click here")', () => {
    const html = renderToString(React.createElement(GlobalNav));

    expect(html).toContain('>DevLens<');
    expect(html).toContain('>Scans<');
    expect(html).toContain('>New Scan<');
    expect(html).toContain('>Technologies<');
  });
});

describe('GlobalNav — active state', () => {
  beforeEach(() => {
    mockPathname.value = '/';
  });

  it('marks the brand as active (aria-current="page") on the home route', () => {
    mockPathname.value = '/';
    const html = renderToString(React.createElement(GlobalNav));

    const brandMatch = html.match(/href="\/"[^>]*aria-current="page"/);
    expect(brandMatch).not.toBeNull();
  });

  it('marks the Scans link as active on /scans', () => {
    mockPathname.value = '/scans';
    const html = renderToString(React.createElement(GlobalNav));

    // The /scans link should have aria-current="page"
    const scansMatch = html.match(/href="\/scans"[^>]*aria-current="page"/);
    expect(scansMatch).not.toBeNull();
  });

  it('marks the Scans link as active on /scans/{id} (child route)', () => {
    mockPathname.value = '/scans/scan_001';
    const html = renderToString(React.createElement(GlobalNav));

    const scansMatch = html.match(/href="\/scans"[^>]*aria-current="page"/);
    expect(scansMatch).not.toBeNull();
  });

  it('marks the Scans link as active on /scans/compare', () => {
    mockPathname.value = '/scans/compare';
    const html = renderToString(React.createElement(GlobalNav));

    const scansMatch = html.match(/href="\/scans"[^>]*aria-current="page"/);
    expect(scansMatch).not.toBeNull();
  });

  it('marks the Technologies link as active on /technologies', () => {
    mockPathname.value = '/technologies';
    const html = renderToString(React.createElement(GlobalNav));

    const techMatch = html.match(/href="\/technologies"[^>]*aria-current="page"/);
    expect(techMatch).not.toBeNull();
  });

  it('marks the Technologies link as active on /technologies/{id} (child route)', () => {
    mockPathname.value = '/technologies/nginx';
    const html = renderToString(React.createElement(GlobalNav));

    const techMatch = html.match(/href="\/technologies"[^>]*aria-current="page"/);
    expect(techMatch).not.toBeNull();
  });

  it('marks the New Scan link as active on /scans/new', () => {
    mockPathname.value = '/scans/new';
    const html = renderToString(React.createElement(GlobalNav));

    const newScanMatch = html.match(/href="\/scans\/new"[^>]*aria-current="page"/);
    expect(newScanMatch).not.toBeNull();
  });

  it('does not mark any non-home link as active when on the home route', () => {
    mockPathname.value = '/';
    const html = renderToString(React.createElement(GlobalNav));

    // The /scans link should NOT have aria-current
    const scansLink = html.match(/href="\/scans"[^>]*>/);
    if (scansLink) {
      expect(scansLink[0]).not.toContain('aria-current');
    }

    // The /technologies link should NOT have aria-current
    const techLink = html.match(/href="\/technologies"[^>]*>/);
    if (techLink) {
      expect(techLink[0]).not.toContain('aria-current');
    }

    // The /scans/new link should NOT have aria-current
    const newScanLink = html.match(/href="\/scans\/new"[^>]*>/);
    if (newScanLink) {
      expect(newScanLink[0]).not.toContain('aria-current');
    }
  });
});
