/**
 * Unit tests for the CopyReportLink component and its pure sub-component
 * CopyFeedback.
 *
 * CopyReportLink is a 'use client' component using `useState`. Since
 * `renderToString` from `react-dom/server` does not execute `useEffect`
 * or event handlers, these tests focus on:
 *
 * - The initial render (button exists with correct label)
 * - The CopyFeedback pure sub-component (accessible feedback)
 * - The clipboard utility (success/failure)
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { CopyReportLink, CopyFeedback } from './CopyReportLink.js';
import { copyToClipboard } from '../lib/clipboard.js';

describe('CopyReportLink', () => {
  it('renders a copy button with an accessible label', () => {
    const html = renderToString(React.createElement(CopyReportLink, { scanId: 'scan_001' }));

    expect(html).toContain('Copy report link');
    expect(html).toContain('aria-label="Copy report link"');
    expect(html).toContain('type="button"');
  });

  it('clipboard success returns true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });

    const result = await copyToClipboard('https://example.com/scans/scan_001');
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('clipboard failure returns false when clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: undefined,
    });

    const result = await copyToClipboard('test');
    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });

  it('CopyFeedback renders accessible success feedback', () => {
    const html = renderToString(React.createElement(CopyFeedback, { status: 'copied' }));

    expect(html).toContain('Copied!');
    expect(html).toContain('aria-live="polite"');
  });
});
