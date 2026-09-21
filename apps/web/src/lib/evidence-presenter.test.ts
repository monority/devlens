/**
 * Unit tests for the evidence presentation mapping layer.
 *
 * These are pure-function tests (no React, no DOM). They verify that
 * each evidence type maps to the correct human-readable label and
 * extracted fields, and that unknown evidence types are handled safely.
 */

import { describe, it, expect } from 'vitest';
import {
  evidenceTypeLabel,
  evidenceFields,
  evidenceIsUrl,
  evidenceUrl,
} from '../lib/evidence-presenter.js';
import type { EvidenceResponse } from '../lib/types.js';

describe('evidenceTypeLabel', () => {
  it('returns "HTTP Header" for http_header', () => {
    expect(evidenceTypeLabel('http_header')).toBe('HTTP Header');
  });

  it('returns "Meta Tag" for meta_tag', () => {
    expect(evidenceTypeLabel('meta_tag')).toBe('Meta Tag');
  });

  it('returns "Script URL" for script_url', () => {
    expect(evidenceTypeLabel('script_url')).toBe('Script URL');
  });

  it('returns "Script Content" for script_content', () => {
    expect(evidenceTypeLabel('script_content')).toBe('Script Content');
  });

  it('returns "HTML Element" for html', () => {
    expect(evidenceTypeLabel('html')).toBe('HTML Element');
  });

  it('returns "JavaScript Global" for javascript_global', () => {
    expect(evidenceTypeLabel('javascript_global')).toBe('JavaScript Global');
  });

  it('returns "Resource URL" for resource', () => {
    expect(evidenceTypeLabel('resource')).toBe('Resource URL');
  });

  it('returns "Link" for link', () => {
    expect(evidenceTypeLabel('link')).toBe('Link');
  });

  it('returns "Evidence" for unknown types', () => {
    expect(evidenceTypeLabel('unknown_type' as EvidenceResponse['type'])).toBe('Evidence');
  });
});

describe('evidenceFields', () => {
  it('extracts name and value for http_header', () => {
    const item: EvidenceResponse = { type: 'http_header', name: 'X-Powered-By', value: 'React' };
    const fields = evidenceFields(item);

    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe('Header');
    expect(fields[0]!.value).toBe('X-Powered-By: React');
  });

  it('extracts name and content for meta_tag', () => {
    const item: EvidenceResponse = { type: 'meta_tag', name: 'generator', content: 'Hugo 0.1' };
    const fields = evidenceFields(item);

    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe('Meta Tag');
    expect(fields[0]!.value).toBe('generator: Hugo 0.1');
  });

  it('extracts URL for script_url', () => {
    const item: EvidenceResponse = { type: 'script_url', url: 'https://cdn.example.com/react.js' };
    const fields = evidenceFields(item);

    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe('URL');
    expect(fields[0]!.value).toBe('https://cdn.example.com/react.js');
  });

  it('extracts snippet for script_content', () => {
    const item: EvidenceResponse = { type: 'script_content', snippet: 'window.__REACT__' };
    const fields = evidenceFields(item);

    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe('Snippet');
    expect(fields[0]!.value).toBe('window.__REACT__');
  });

  it('extracts selector and snippet for html', () => {
    const item: EvidenceResponse = { type: 'html', selector: 'meta#react', snippet: '<meta>' };
    const fields = evidenceFields(item);

    expect(fields).toHaveLength(2);
    expect(fields[0]!.label).toBe('Selector');
    expect(fields[0]!.value).toBe('meta#react');
    expect(fields[1]!.label).toBe('Snippet');
    expect(fields[1]!.value).toBe('<meta>');
  });

  it('extracts globalName for javascript_global', () => {
    const item: EvidenceResponse = { type: 'javascript_global', globalName: 'React' };
    const fields = evidenceFields(item);

    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe('Global');
    expect(fields[0]!.value).toBe('React');
  });

  it('extracts URL for resource', () => {
    const item: EvidenceResponse = { type: 'resource', url: 'https://cdn.example.com/logo.png' };
    const fields = evidenceFields(item);

    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe('URL');
    expect(fields[0]!.value).toBe('https://cdn.example.com/logo.png');
  });

  it('extracts URL for link', () => {
    const item: EvidenceResponse = { type: 'link', url: 'https://cdn.example.com/style.css' };
    const fields = evidenceFields(item);

    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe('URL');
    expect(fields[0]!.value).toBe('https://cdn.example.com/style.css');
  });

  it('returns a JSON fallback for unknown evidence type', () => {
    const item: EvidenceResponse = {
      type: 'future_evidence',
      data: 'something',
    } as unknown as EvidenceResponse;
    const fields = evidenceFields(item);

    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe('Data');
    expect(fields[0]!.value).toContain('future_evidence');
  });
});

describe('evidenceIsUrl', () => {
  it('returns true for script_url', () => {
    expect(evidenceIsUrl({ type: 'script_url', url: 'https://example.com/script.js' })).toBe(true);
  });

  it('returns true for resource', () => {
    expect(evidenceIsUrl({ type: 'resource', url: 'https://example.com/image.png' })).toBe(true);
  });

  it('returns true for link', () => {
    expect(evidenceIsUrl({ type: 'link', url: 'https://example.com/style.css' })).toBe(true);
  });

  it('returns false for http_header', () => {
    expect(evidenceIsUrl({ type: 'http_header', name: 'Server', value: 'nginx' })).toBe(false);
  });

  it('returns false for meta_tag', () => {
    expect(evidenceIsUrl({ type: 'meta_tag', name: 'generator', content: 'Hugo' })).toBe(false);
  });

  it('returns false for script_content', () => {
    expect(evidenceIsUrl({ type: 'script_content', snippet: 'foo' })).toBe(false);
  });

  it('returns false for html', () => {
    expect(evidenceIsUrl({ type: 'html', selector: 'meta', snippet: 'foo' })).toBe(false);
  });

  it('returns false for javascript_global', () => {
    expect(evidenceIsUrl({ type: 'javascript_global', globalName: 'React' })).toBe(false);
  });
});

describe('evidenceUrl', () => {
  it('returns the URL for script_url', () => {
    const item: EvidenceResponse = { type: 'script_url', url: 'https://example.com/script.js' };
    expect(evidenceUrl(item)).toBe('https://example.com/script.js');
  });

  it('returns the URL for resource', () => {
    const item: EvidenceResponse = { type: 'resource', url: 'https://example.com/image.png' };
    expect(evidenceUrl(item)).toBe('https://example.com/image.png');
  });

  it('returns the URL for link', () => {
    const item: EvidenceResponse = { type: 'link', url: 'https://example.com/style.css' };
    expect(evidenceUrl(item)).toBe('https://example.com/style.css');
  });

  it('returns null for non-URL evidence types', () => {
    const item: EvidenceResponse = { type: 'http_header', name: 'Server', value: 'nginx' };
    expect(evidenceUrl(item)).toBeNull();
  });
});

describe('evidence presentation — resource_content (Step 63)', () => {
  const item: EvidenceResponse = {
    type: 'resource_content',
    url: 'https://cdn.example.com/main.js',
    resourceType: 'script',
    match: 'ng.version',
    snippet: 'ng=require(["angular"])',
  };

  it('labels resource_content as "Resource Content"', () => {
    expect(evidenceTypeLabel('resource_content')).toBe('Resource Content');
  });

  it('extracts resource, type, match, and snippet fields', () => {
    const fields = evidenceFields(item);

    expect(fields).toHaveLength(4);
    expect(fields[0]!.label).toBe('Resource');
    expect(fields[0]!.value).toBe('https://cdn.example.com/main.js');
    expect(fields[1]!.label).toBe('Type');
    expect(fields[1]!.value).toBe('script');
    expect(fields[2]!.label).toBe('Match');
    expect(fields[2]!.value).toBe('ng.version');
    expect(fields[3]!.label).toBe('Snippet');
    expect(fields[3]!.value).toBe('ng=require(["angular"])');
  });

  it('is not a URL-type evidence (content match, not a clickable link)', () => {
    expect(evidenceIsUrl(item)).toBe(false);
    expect(evidenceUrl(item)).toBeNull();
  });
});
