/**
 * Unit tests for the `/scans/new` page component (`NewScanPage`).
 *
 * `NewScanPage` is an async server component. It reads the `target` query
 * parameter from `searchParams` and passes it as `initialUrl` to `ScanForm`.
 *
 * Since `ScanForm` uses client-side hooks (useState, useRouter), it is
 * mocked to a simple placeholder that records the `initialUrl` prop.
 *
 * `next/link` is mocked to render a plain `<a>` tag, consistent with
 * the existing test conventions across the codebase.
 *
 * `renderToString` from `react-dom/server` requires a resolved React element.
 * For the async server component, we await the component call directly.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Mock next/link to render a plain <a> tag (no router context needed)
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// Mock ScanForm (client component with hooks) as a simple placeholder
// that records the initialUrl prop for testing prefill behavior
vi.mock('@/components/ScanForm', () => ({
  ScanForm: ({ initialUrl }: { initialUrl?: string }) =>
    React.createElement(
      'div',
      { 'data-testid': 'scan-form', 'data-initial-url': initialUrl ?? '' },
      'Scan Form',
    ),
}));

// Must import after mocks are set up
import NewScanPage from '@/app/scans/new/page.js';

// ─── Tests ───────────────────────────────────────────────────────────

describe('NewScanPage', () => {
  it('renders the "New Scan" heading', async () => {
    const html = renderToString(await NewScanPage({}));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('New Scan');
  });

  it('renders the subtitle explaining the input', async () => {
    const html = renderToString(await NewScanPage({}));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Enter a target URL to start scanning.');
  });

  it('renders helper text explaining the journey', async () => {
    const html = renderToString(await NewScanPage({}));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('DevLens will crawl the target');
    expect(cleaned).toContain('analyze it for supported technologies');
    expect(cleaned).toContain('take you to the results page');
  });

  it('renders a back link to scan history', async () => {
    const html = renderToString(await NewScanPage({}));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('href="/scans"');
    expect(cleaned).toContain('Back to scan history');
  });

  it('renders the ScanForm component', async () => {
    const html = renderToString(await NewScanPage({}));

    expect(html).toContain('data-testid="scan-form"');
  });

  it('does not contain any fake progress indicator', async () => {
    const html = renderToString(await NewScanPage({}));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).not.toContain('progress');
    expect(cleaned).not.toContain('%');
  });

  // ─── Step 56: Re-scan target prefill tests ──────────────────────────

  it('passes the target query parameter as initialUrl to ScanForm', async () => {
    const html = renderToString(
      await NewScanPage({
        searchParams: Promise.resolve({ target: 'https://example.com/' }),
      }),
    );

    expect(html).toContain('data-initial-url="https://example.com/"');
  });

  it('absent target query parameter keeps empty-form behavior', async () => {
    const html = renderToString(await NewScanPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('data-testid="scan-form"');
    expect(html).toContain('data-initial-url=""');
  });

  it('does not auto-submit when target is prefilled', async () => {
    const html = renderToString(
      await NewScanPage({
        searchParams: Promise.resolve({ target: 'https://example.com/' }),
      }),
    );

    // The form should be present in its default state — no auto-submit.
    // The mock renders "Scan Form" placeholder, not a loading state.
    expect(html).toContain('data-testid="scan-form"');
    expect(html).toContain('data-initial-url="https://example.com/"');
    expect(html).not.toContain('Starting scan');
  });

  it('target query parameter with special characters is passed through verbatim', async () => {
    const target = 'https://example.com/path?q=hello&lang=en';
    const html = renderToString(
      await NewScanPage({
        searchParams: Promise.resolve({ target }),
      }),
    );
    const decoded = html.replace(/&amp;/g, '&');

    expect(decoded).toContain(`data-initial-url="${target}"`);
  });

  it('empty target query parameter keeps empty-form behavior', async () => {
    const html = renderToString(
      await NewScanPage({ searchParams: Promise.resolve({ target: '' }) }),
    );

    expect(html).toContain('data-initial-url=""');
    expect(html).toContain('data-testid="scan-form"');
  });
});
