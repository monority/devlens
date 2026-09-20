import { describe, it, expect } from 'vitest';
import type { Evidence } from './evidence';
import { createUrl } from './value-objects';

describe('Evidence types', () => {
  it('creates HtmlEvidence', () => {
    const e: Evidence = {
      type: 'html',
      selector: 'div[data-tech="react"]',
      snippet: '<div data-tech="react">',
    };
    if (e.type !== 'html') throw new Error('wrong type');
    expect(e.snippet).toBe('<div data-tech="react">');
  });

  it('creates HttpHeaderEvidence', () => {
    const e: Evidence = {
      type: 'http_header',
      name: 'X-Powered-By',
      value: 'Express',
    };
    if (e.type !== 'http_header') throw new Error('wrong type');
    expect(e.name).toBe('X-Powered-By');
    expect(e.value).toBe('Express');
  });

  it('creates ScriptUrlEvidence', () => {
    const e: Evidence = {
      type: 'script_url',
      url: createUrl('https://cdn.example.com/react.production.min.js'),
    };
    if (e.type !== 'script_url') throw new Error('wrong type');
    expect(e.url).toBe('https://cdn.example.com/react.production.min.js');
  });

  it('creates ScriptContentEvidence', () => {
    const e: Evidence = {
      type: 'script_content',
      snippet: '__NEXT_DATA__',
    };
    if (e.type !== 'script_content') throw new Error('wrong type');
    expect(e.snippet).toBe('__NEXT_DATA__');
  });

  it('creates MetaTagEvidence', () => {
    const e: Evidence = {
      type: 'meta_tag',
      name: 'generator',
      content: 'Next.js',
    };
    if (e.type !== 'meta_tag') throw new Error('wrong type');
    expect(e.content).toBe('Next.js');
  });

  it('creates JavaScriptGlobalEvidence', () => {
    const e: Evidence = {
      type: 'javascript_global',
      globalName: '__NUXT__',
    };
    if (e.type !== 'javascript_global') throw new Error('wrong type');
    expect(e.globalName).toBe('__NUXT__');
  });

  it('creates ResourceEvidence', () => {
    const e: Evidence = {
      type: 'resource',
      url: createUrl('https://example.com/.next/static/chunks/main.js'),
    };
    if (e.type !== 'resource') throw new Error('wrong type');
    expect(e.url).toBe('https://example.com/.next/static/chunks/main.js');
  });

  it('creates LinkEvidence', () => {
    const e: Evidence = {
      type: 'link',
      url: createUrl('https://cdn.shopify.com/s/files/1.js'),
    };
    if (e.type !== 'link') throw new Error('wrong type');
    expect(e.url).toBe('https://cdn.shopify.com/s/files/1.js');
  });

  it('creates ResourceContentEvidence', () => {
    const e: Evidence = {
      type: 'resource_content',
      url: createUrl('https://example.com/main.abcdef.js'),
      resourceType: 'script',
      match: '@angular/core',
      snippet: 'import { Component } from "@angular/core";',
    };
    if (e.type !== 'resource_content') throw new Error('wrong type');
    expect(e.url).toBe('https://example.com/main.abcdef.js');
    expect(e.resourceType).toBe('script');
    expect(e.match).toBe('@angular/core');
    expect(e.snippet).toBe('import { Component } from "@angular/core";');
  });

  it('supports LinkEvidence in the discriminated union', () => {
    const evidence: Evidence[] = [
      { type: 'link', url: createUrl('https://cdn.shopify.com/s/files/1.js') },
    ];
    const linkEvidence = evidence.find((e) => e.type === 'link');
    expect(linkEvidence).toBeDefined();
    if (linkEvidence && linkEvidence.type === 'link') {
      expect(linkEvidence.url).toBe('https://cdn.shopify.com/s/files/1.js');
    }
  });

  it('allows discriminated union narrowing via type field', () => {
    const evidence: Evidence[] = [
      { type: 'html', selector: 'body', snippet: '<body>' },
      { type: 'http_header', name: 'Server', value: 'cloudflare' },
      { type: 'javascript_global', globalName: 'window' },
    ];
    const httpEvidence = evidence.find((e) => e.type === 'http_header');
    expect(httpEvidence).toBeDefined();
    if (httpEvidence && httpEvidence.type === 'http_header') {
      expect(httpEvidence.value).toBe('cloudflare');
    }
  });

  it('supports ScriptContentEvidence in the discriminated union', () => {
    const evidence: Evidence[] = [{ type: 'script_content', snippet: '__NEXT_DATA__' }];
    const scriptEvidence = evidence.find((e) => e.type === 'script_content');
    expect(scriptEvidence).toBeDefined();
    if (scriptEvidence && scriptEvidence.type === 'script_content') {
      expect(scriptEvidence.snippet).toBe('__NEXT_DATA__');
    }
  });
});
