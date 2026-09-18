/**
 * Unit tests for the EvidenceList component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment.
 * The `next/link` mock is not needed here since EvidenceList doesn't
 * use Link. EvidenceItem is tested separately.
 *
 * Tests verify the collapsible `<details>/<summary>` disclosure
 * behavior, which provides native keyboard accessibility and no-JS
 * expand/collapse.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { EvidenceList } from './EvidenceList.js';
import type { EvidenceResponse } from '../lib/types.js';

// Mock next/link to avoid router context errors (used by EvidenceItem
// for URL evidence rendering).
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// ─── Test fixtures ───────────────────────────────────────────────────

function makeEvidence(
  type: EvidenceResponse['type'],
  data: Partial<Record<string, unknown>> = {},
): EvidenceResponse {
  return { type, ...data } as EvidenceResponse;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('EvidenceList', () => {
  it('renders null when evidence array is empty', () => {
    const html = renderToString(React.createElement(EvidenceList, { evidence: [] }));
    expect(html).toBe('');
  });

  it('renders a collapsible <details> element with <summary>', () => {
    const evidence: EvidenceResponse[] = [
      makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
    ];
    const html = renderToString(React.createElement(EvidenceList, { evidence }));

    expect(html).toContain('<details');
    expect(html).toContain('<summary');
  });

  it('renders evidence count in the summary', () => {
    const evidence: EvidenceResponse[] = [
      makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
      makeEvidence('meta_tag', { name: 'generator', content: 'Hugo' }),
      makeEvidence('script_url', { url: 'https://cdn.example.com/app.js' }),
    ];
    const html = renderToString(React.createElement(EvidenceList, { evidence }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Evidence (3)');
  });

  it('renders singular count for a single evidence item', () => {
    const evidence: EvidenceResponse[] = [
      makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
    ];
    const html = renderToString(React.createElement(EvidenceList, { evidence }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Evidence (1)');
  });

  it('is collapsed by default (no open attribute)', () => {
    const evidence: EvidenceResponse[] = [
      makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
    ];
    const html = renderToString(React.createElement(EvidenceList, { evidence }));

    // <details> without the "open" attribute is collapsed by default.
    // React renderToString does not add open="" unless the prop is true.
    expect(html).toContain('<details');
    expect(html).not.toContain('open=""');
    expect(html).not.toContain('open>');
  });

  it('renders all evidence items inside the disclosure', () => {
    const evidence: EvidenceResponse[] = [
      makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
      makeEvidence('script_url', { url: 'https://cdn.example.com/app.js' }),
    ];
    const html = renderToString(React.createElement(EvidenceList, { evidence }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Both evidence items should be rendered
    expect(cleaned).toContain('HTTP Header');
    expect(cleaned).toContain('Script URL');
    expect(cleaned).toContain('nginx');
    expect(cleaned).toContain('https://cdn.example.com/app.js');
  });

  it('renders long URL values safely within the disclosure', () => {
    const longUrl =
      'https://very-long-cdn-subdomain.example.com/assets/static/scripts/vendor/bundle/' +
      'very-long-path-name-that-goes-on-forever-and-ever.min.js?v=1234567890';
    const evidence: EvidenceResponse[] = [makeEvidence('script_url', { url: longUrl })];
    const html = renderToString(React.createElement(EvidenceList, { evidence }));

    expect(html).toContain(longUrl);
    expect(html).toContain('href');
  });

  it('uses semantic HTML for accessibility (details/summary element)', () => {
    const evidence: EvidenceResponse[] = [
      makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
    ];
    const html = renderToString(React.createElement(EvidenceList, { evidence }));

    // <details> is natively keyboard-accessible (Enter/Space toggles)
    // <summary> provides the accessible name for the disclosure
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
  });

  it('does not crash on unknown evidence types', () => {
    const evidence: EvidenceResponse[] = [
      { type: 'future_type', data: 'unknown' } as unknown as EvidenceResponse,
    ];
    const html = renderToString(React.createElement(EvidenceList, { evidence }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Should render without crashing
    expect(cleaned).toContain('<details');
    expect(cleaned).toContain('Evidence (1)');
  });
});
