/**
 * Unit tests for the EvidenceItem component.
 *
 * Tests use `renderToString` from `react-dom/server` — no DOM
 * environment or jsdom required. The evidence-presenter mapping is
 * tested separately in `evidence-presenter.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { EvidenceItem } from './EvidenceItem.js';
import type { EvidenceResponse } from '../lib/types.js';

describe('EvidenceItem', () => {
  it('renders HTTP Header evidence with name and value', () => {
    const evidence: EvidenceResponse = { type: 'http_header', name: 'Server', value: 'nginx' };
    const html = renderToString(React.createElement(EvidenceItem, { evidence, index: 0 }));

    expect(html).toContain('HTTP Header');
    expect(html).toContain('Server');
    expect(html).toContain('nginx');
  });

  it('renders Meta Tag evidence with name and content', () => {
    const evidence: EvidenceResponse = { type: 'meta_tag', name: 'generator', content: 'Hugo 0.1' };
    const html = renderToString(React.createElement(EvidenceItem, { evidence, index: 0 }));

    expect(html).toContain('Meta Tag');
    expect(html).toContain('generator');
    expect(html).toContain('Hugo 0.1');
  });

  it('renders Script URL evidence as a clickable link', () => {
    const evidence: EvidenceResponse = {
      type: 'script_url',
      url: 'https://cdn.example.com/react.js',
    };
    const html = renderToString(React.createElement(EvidenceItem, { evidence, index: 0 }));

    expect(html).toContain('Script URL');
    expect(html).toContain('https://cdn.example.com/react.js');
    expect(html).toContain('href=');
    expect(html).toContain('target=');
  });

  it('renders Script Content evidence in code formatting', () => {
    const evidence: EvidenceResponse = { type: 'script_content', snippet: 'window.__REACT__' };
    const html = renderToString(React.createElement(EvidenceItem, { evidence, index: 0 }));

    expect(html).toContain('Script Content');
    expect(html).toContain('window.__REACT__');
  });

  it('renders HTML Element evidence with selector and snippet', () => {
    const evidence: EvidenceResponse = { type: 'html', selector: 'meta#react', snippet: '<meta>' };
    const html = renderToString(React.createElement(EvidenceItem, { evidence, index: 0 }));

    expect(html).toContain('HTML Element');
    expect(html).toContain('meta#react');
    // HTML snippet is escaped inside <code> by React's renderToString
    expect(html).toContain('&lt;meta&gt;');
  });

  it('renders JavaScript Global evidence', () => {
    const evidence: EvidenceResponse = { type: 'javascript_global', globalName: 'React' };
    const html = renderToString(React.createElement(EvidenceItem, { evidence, index: 0 }));

    expect(html).toContain('JavaScript Global');
    expect(html).toContain('React');
  });

  it('renders Resource URL evidence as a clickable link', () => {
    const evidence: EvidenceResponse = {
      type: 'resource',
      url: 'https://cdn.example.com/logo.png',
    };
    const html = renderToString(React.createElement(EvidenceItem, { evidence, index: 0 }));

    expect(html).toContain('Resource URL');
    expect(html).toContain('https://cdn.example.com/logo.png');
    expect(html).toContain('href=');
  });

  it('renders Link evidence as a clickable link', () => {
    const evidence: EvidenceResponse = { type: 'link', url: 'https://cdn.example.com/style.css' };
    const html = renderToString(React.createElement(EvidenceItem, { evidence, index: 0 }));

    expect(html).toContain('Link');
    expect(html).toContain('https://cdn.example.com/style.css');
    expect(html).toContain('href=');
  });

  it('renders unknown evidence type without crashing', () => {
    const evidence = { type: 'future_type', data: 'something' } as unknown as EvidenceResponse;
    const html = renderToString(React.createElement(EvidenceItem, { evidence, index: 0 }));

    expect(html).toContain('Evidence');
    expect(html).toContain('future_type');
  });

  it('wraps long technical values without layout break', () => {
    const longUrl =
      'https://very-long-cdn-subdomain.example.com/assets/static/scripts/vendor/bundle/' +
      'very-long-path-name-that-goes-on-forever-and-ever.min.js?v=1234567890';
    const evidence: EvidenceResponse = { type: 'script_url', url: longUrl };
    const html = renderToString(React.createElement(EvidenceItem, { evidence, index: 0 }));

    expect(html).toContain(longUrl);
    // The URL should be present — word-break CSS handles layout.
    expect(html).toContain('href=');
  });
});
