/**
 * UI tests for the technology catalog and detail pages.
 *
 * Tests:
 * - /technologies renders catalog entries
 * - technology entries link to the correct detail route
 * - detail page renders known technology
 * - unknown technology triggers notFound
 *
 * Also tests DetectionItem with technology links:
 * - detection technology links to the correct detail route
 * - unknown detection IDs do not produce broken catalog links
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment.
 * `next/link` is mocked to render plain `<a>` tags.
 * `next/navigation`'s `notFound` is mocked to throw a catchable error.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Mock next/link to render a plain <a> tag
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => React.createElement('a', { href, className }, children),
}));

// Mock next/navigation so notFound() throws a catchable error
// and useRouter/useSearchParams work for the client component
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

import { notFound } from 'next/navigation';
import TechnologiesPage from '@/app/technologies/page.js';
import TechnologyDetailPage, { generateMetadata } from '@/app/technologies/[id]/page.js';
import { DetectionItem } from '@/components/DetectionItem.js';
import { getTechnologyById } from '@/lib/technology-catalog.js';
import { TECHNOLOGY_CATALOG } from '@devlens/detectors';

// ─── Helpers ─────────────────────────────────────────────────────────

function clean(html: string): string {
  return html.replace(/<!-- -->/g, '');
}

function makeDetection(techId: string, techName: string, techCategory: string, confidence: number) {
  return {
    technology: { id: techId, name: techName, category: techCategory },
    confidence,
    evidence: [],
  };
}

// ─── Catalog page tests ─────────────────────────────────────────────

describe('TechnologiesPage', () => {
  it('renders catalog entries', async () => {
    const result = await TechnologiesPage({ searchParams: Promise.resolve({}) });
    const html = renderToString(result);
    const cleaned = clean(html);

    // Should contain known technology names
    expect(cleaned).toContain('React');
    expect(cleaned).toContain('nginx');
    expect(cleaned).toContain('WordPress');

    // Should contain "Technology Catalog" heading
    expect(cleaned).toContain('Technology Catalog');
  });

  it('technology entries link to the correct detail route', async () => {
    const result = await TechnologiesPage({ searchParams: Promise.resolve({}) });
    const html = renderToString(result);
    const cleaned = clean(html);

    // Each catalog entry should link to /technologies/{id}
    const catalogKeys = Object.keys(TECHNOLOGY_CATALOG);
    for (const key of catalogKeys) {
      expect(cleaned).toContain(`/technologies/${encodeURIComponent(key)}`);
    }
  });
});

// ─── Detail page tests ───────────────────────────────────────────────

describe('TechnologyDetailPage', () => {
  it('renders known technology', async () => {
    const result = await TechnologyDetailPage({
      params: Promise.resolve({ id: 'react' }),
    });
    const html = renderToString(result);
    const cleaned = clean(html);

    expect(cleaned).toContain('React');
    expect(cleaned).toContain('framework');
    // Description should be present
    const tech = getTechnologyById('react');
    expect(cleaned).toContain(tech!.description);
  });

  it('unknown technology triggers notFound', async () => {
    vi.mocked(notFound).mockClear();

    await expect(
      TechnologyDetailPage({ params: Promise.resolve({ id: 'nonexistent' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalled();
  });
});

// ─── Metadata tests ──────────────────────────────────────────────────

describe('generateMetadata', () => {
  it('produces "DevLens — {Technology Name}" for known technologies', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'react' }) });
    expect(meta.title).toBe('DevLens — React');
    const tech = getTechnologyById('react');
    expect(meta.description).toBe(tech!.description);
  });

  it('unknown technology metadata does not leak arbitrary IDs', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ id: 'nonexistent-tech-id' }),
    });
    expect(meta.title).not.toContain('nonexistent-tech-id');
    expect(meta.title).toContain('Not Found');
  });
});

// ─── Detection link tests ────────────────────────────────────────────

describe('DetectionItem technology links', () => {
  it('links known technology to correct detail route', () => {
    const detection = makeDetection('react', 'React', 'framework', 95);
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const cleaned = clean(html);

    // The technology name should be a link to /technologies/react
    expect(cleaned).toContain('/technologies/react');
    expect(cleaned).toContain('React');
  });

  it('unknown technology IDs do not produce broken catalog links', () => {
    const detection = makeDetection('unknown-tech', 'Unknown Tech', 'unknown', 50);
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const cleaned = clean(html);

    // Technology name should NOT be a link
    expect(cleaned).not.toContain('/technologies/unknown-tech');
    // But the name should still be visible as plain text
    expect(cleaned).toContain('Unknown Tech');
  });
});
