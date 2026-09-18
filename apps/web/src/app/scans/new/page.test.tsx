/**
 * Unit tests for the `/scans/new` page component (`NewScanPage`).
 *
 * `NewScanPage` is a synchronous server component (not async). It renders
 * a heading, subtitle, helper text, a back link, and the `ScanForm`
 * client component.
 *
 * Since `ScanForm` uses client-side hooks (useState, useRouter), it is
 * mocked to a simple placeholder so `renderToString` can render the
 * page structure in the node test environment.
 *
 * `next/link` is mocked to render a plain `<a>` tag, consistent with
 * the existing test conventions across the codebase.
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
vi.mock('@/components/ScanForm', () => ({
  ScanForm: () => React.createElement('div', { 'data-testid': 'scan-form' }, 'Scan Form'),
}));

// Must import after mocks are set up
import NewScanPage from '@/app/scans/new/page.js';

// ─── Tests ───────────────────────────────────────────────────────────

describe('NewScanPage', () => {
  it('renders the "New Scan" heading', () => {
    const html = renderToString(React.createElement(NewScanPage));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('New Scan');
  });

  it('renders the subtitle explaining the input', () => {
    const html = renderToString(React.createElement(NewScanPage));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Enter a target URL to start scanning.');
  });

  it('renders helper text explaining the journey', () => {
    const html = renderToString(React.createElement(NewScanPage));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('DevLens will crawl the target');
    expect(cleaned).toContain('analyze it for supported technologies');
    expect(cleaned).toContain('take you to the results page');
  });

  it('renders a back link to scan history', () => {
    const html = renderToString(React.createElement(NewScanPage));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('href="/scans"');
    expect(cleaned).toContain('Back to scan history');
  });

  it('renders the ScanForm component', () => {
    const html = renderToString(React.createElement(NewScanPage));

    expect(html).toContain('data-testid="scan-form"');
  });

  it('does not contain any fake progress indicator', () => {
    const html = renderToString(React.createElement(NewScanPage));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).not.toContain('progress');
    expect(cleaned).not.toContain('%');
  });
});
