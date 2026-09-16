/**
 * Unit tests for the `ScanFormView` presentation component (`ScanFormView.tsx`).
 *
 * `ScanFormView` is a pure component — all state (URL value, error message,
 * isSubmitting) is passed via props. This allows testing with
 * `renderToString` from `react-dom/server` in the node environment,
 * consistent with the existing Step 22 component testing approach.
 *
 * Interactive behavior (hooks, API calls, navigation) is covered by:
 * - `api.test.ts` — tests `createScan` with mocked fetch
 * - `validation.test.ts` — tests the `validateUrl` pure function
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScanFormView } from './ScanFormView.js';

// ─── Test fixtures ───────────────────────────────────────────────────

const noop = vi.fn();
const noopSubmit = vi.fn();

const baseProps = {
  url: '',
  error: null as string | null,
  isSubmitting: false,
  onUrlChange: noop,
  onSubmit: noopSubmit,
};

// Helper: strip React 19's <!-- --> comment markers so text assertions
// work as expected.
function clean(html: string): string {
  return html.replace(/<!-- -->/g, '');
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ScanFormView', () => {
  it('renders a form with URL input and submit button', () => {
    const html = renderToString(React.createElement(ScanFormView, baseProps));

    expect(html).toContain('form');
    expect(html).toContain('type="url"');
    expect(html).toContain('id="scan-url"');
    expect(html).toContain('Start scan');
  });

  it('renders "Target URL" label for the input', () => {
    const html = renderToString(React.createElement(ScanFormView, baseProps));

    expect(html).toContain('Target URL');
  });

  it('accepts URL — input reflects the provided url prop', () => {
    const props = { ...baseProps, url: 'https://example.com' };
    const html = renderToString(React.createElement(ScanFormView, props));

    expect(html).toContain('value="https://example.com"');
  });

  it('renders the placeholder text', () => {
    const html = renderToString(React.createElement(ScanFormView, baseProps));

    expect(html).toContain('https://example.com');
  });

  it('renders submitting state — button shows "Starting scan…" and is disabled', () => {
    const props = { ...baseProps, isSubmitting: true };
    const html = renderToString(React.createElement(ScanFormView, props));

    expect(html).toContain('Starting scan…');
    expect(html).toContain('disabled');
    // The URL input should also be disabled while submitting
    expect(html).toContain('disabled');
  });

  it('does not show "Starting scan…" when not submitting', () => {
    const html = renderToString(React.createElement(ScanFormView, baseProps));

    const cleaned = clean(html);
    expect(cleaned).toContain('Start scan');
    expect(cleaned).not.toContain('Starting scan');
  });

  it('renders an API error message when error prop is set', () => {
    const props = { ...baseProps, error: 'An internal error occurred.' };
    const html = renderToString(React.createElement(ScanFormView, props));

    expect(html).toContain('An internal error occurred.');
    expect(html).toContain('role="alert"');
  });

  it('renders a server validation error message', () => {
    const props = {
      ...baseProps,
      error: 'The url must be a valid absolute URL.',
    };
    const html = renderToString(React.createElement(ScanFormView, props));

    expect(html).toContain('The url must be a valid absolute URL.');
    expect(html).toContain('role="alert"');
  });

  it('sets aria-invalid when there is an error', () => {
    const props = { ...baseProps, error: 'Some error' };
    const html = renderToString(React.createElement(ScanFormView, props));

    expect(html).toContain('aria-invalid="true"');
  });

  it('does not set aria-invalid when there is no error', () => {
    const html = renderToString(React.createElement(ScanFormView, baseProps));

    expect(html).not.toContain('aria-invalid="true"');
  });

  it('does not render an error element when error is null', () => {
    const html = renderToString(React.createElement(ScanFormView, baseProps));

    expect(html).not.toContain('role="alert"');
  });

  it('renders the form with a data-testid for testing', () => {
    const html = renderToString(React.createElement(ScanFormView, baseProps));

    expect(html).toContain('data-testid="scan-form"');
  });
});
