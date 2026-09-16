import { describe, it, expect } from 'vitest';
import type { SiteSnapshot, HttpObservation, Resource } from './snapshot';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
  createConfidence,
} from './value-objects';
import type { Url, Confidence } from './value-objects';

function makeSnapshot(overrides: Partial<SiteSnapshot> = {}): SiteSnapshot {
  const base: SiteSnapshot = {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [{ name: 'Content-Type', value: 'text/html' }],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'Example Domain',
      description: 'This is an example page',
      metaTags: [],
      scripts: [],
      links: [],
    },
    resources: [
      {
        url: createUrl('https://example.com/script.js'),
        type: 'script',
        size: 1024,
        content: '',
        httpStatus: createHttpStatus(200),
        contentType: null,
      },
    ],
  };
  return { ...base, ...overrides };
}

describe('SiteSnapshot', () => {
  it('creates a snapshot with all fields', () => {
    const snap = makeSnapshot();
    expect(snap.url).toBe('https://example.com');
    expect(snap.hostname).toBe('example.com');
    expect(snap.capturedAt).toBe('2025-06-01T12:00:00.000Z');
    expect(snap.http.statusCode).toBe(200);
    expect(snap.http.contentType).toBe('text/html');
    expect(snap.html.title).toBe('Example Domain');
    expect(snap.resources).toHaveLength(1);
  });

  it('supports snapshots with no resources', () => {
    const snap = makeSnapshot({ resources: [] });
    expect(snap.resources).toHaveLength(0);
  });

  it('supports HTML description being null', () => {
    const snap = makeSnapshot({
      html: {
        title: 'No Description Page',
        description: null,
        metaTags: [],
        scripts: [],
        links: [],
      },
    });
    expect(snap.html.description).toBeNull();
  });

  it('supports empty metaTags array', () => {
    const snap = makeSnapshot();
    expect(snap.html.metaTags).toEqual([]);
  });

  it('supports metaTags with name and content pairs', () => {
    const snap = makeSnapshot({
      html: {
        title: 'Test',
        description: null,
        metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
        scripts: [],
        links: [],
      },
    });
    expect(snap.html.metaTags).toHaveLength(1);
    expect(snap.html.metaTags[0]!.name).toBe('generator');
    expect(snap.html.metaTags[0]!.content).toBe('WordPress 6.4');
  });

  it('supports empty scripts array', () => {
    const snap = makeSnapshot();
    expect(snap.html.scripts).toEqual([]);
  });

  it('supports scripts with src and content', () => {
    const snap = makeSnapshot({
      html: {
        title: 'Test',
        description: null,
        metaTags: [],
        scripts: [
          { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
          { src: null, content: 'console.log("inline")' },
        ],
      },
    });
    expect(snap.html.scripts).toHaveLength(2);
    expect(snap.html.scripts[0]!.src).toBe('https://example.com/_next/static/chunks/main.js');
    expect(snap.html.scripts[0]!.content).toBe('');
    expect(snap.html.scripts[1]!.src).toBeNull();
    expect(snap.html.scripts[1]!.content).toBe('console.log("inline")');
  });
});

describe('HttpObservation', () => {
  it('captures status, headers, content type, and final URL', () => {
    const http: HttpObservation = {
      statusCode: createHttpStatus(200),
      headers: [
        { name: 'Content-Type', value: 'text/html; charset=utf-8' },
        { name: 'X-Powered-By', value: 'Vercel' },
      ],
      contentType: 'text/html; charset=utf-8',
      finalUrl: createUrl('https://example.com/redirected'),
    };
    expect(http.statusCode).toBe(200);
    expect(http.headers).toHaveLength(2);
    expect(http.finalUrl).toBe('https://example.com/redirected');
  });
});

describe('Resource', () => {
  it('creates a resource with size', () => {
    const resource: Resource = {
      url: createUrl('https://example.com/style.css'),
      type: 'stylesheet',
      size: 4096,
      content: 'body { color: red; }',
      httpStatus: createHttpStatus(200),
      contentType: 'text/css',
    };
    expect(resource.type).toBe('stylesheet');
    expect(resource.size).toBe(4096);
  });

  it('supports null size for unknown resource sizes', () => {
    const resource: Resource = {
      url: createUrl('https://example.com/image.png'),
      type: 'image',
      size: null,
      content: '',
      httpStatus: createHttpStatus(200),
      contentType: null,
    };
    expect(resource.size).toBeNull();
  });

  it('creates a css resource (Step 6H)', () => {
    const resource: Resource = {
      url: createUrl('https://example.com/app.css'),
      type: 'css',
      size: 512,
      content: '.red { color: red; }',
      httpStatus: createHttpStatus(200),
      contentType: 'text/css',
    };
    expect(resource.type).toBe('css');
    expect(resource.content).toBe('.red { color: red; }');
  });

  it('creates a robots resource (Step 6H)', () => {
    const resource: Resource = {
      url: createUrl('https://example.com/robots.txt'),
      type: 'robots',
      size: 256,
      content: 'User-agent: *\nDisallow: /admin',
      httpStatus: createHttpStatus(200),
      contentType: 'text/plain',
    };
    expect(resource.type).toBe('robots');
  });

  it('creates a manifest resource (Step 6H)', () => {
    const resource: Resource = {
      url: createUrl('https://example.com/manifest.json'),
      type: 'manifest',
      size: 128,
      content: '{"name": "MyApp"}',
      httpStatus: createHttpStatus(200),
      contentType: 'application/json',
    };
    expect(resource.type).toBe('manifest');
  });

  it('supports null contentType when not fetched', () => {
    const resource: Resource = {
      url: createUrl('https://example.com/found.css'),
      type: 'css',
      size: null,
      content: '',
      httpStatus: createHttpStatus(200),
      contentType: null,
    };
    expect(resource.contentType).toBeNull();
    expect(resource.content).toBe('');
  });
});

describe('Branded type safety', () => {
  it('does not allow assigning a plain string to Url', () => {
    const url: Url = createUrl('https://example.com');
    expect(url).toBe('https://example.com');
    // At runtime, Url is just a string — the branding is compile-time only.
    expect(typeof url).toBe('string');
  });

  it('does not allow assigning a plain number to Confidence', () => {
    const confidence: Confidence = createConfidence(85);
    expect(confidence).toBe(85);
  });
});

describe('SiteSnapshot as independent artifact', () => {
  it('can exist without a Scan', () => {
    const snapshot = makeSnapshot();
    // A snapshot has no scanId, status, or createdAt — it is standalone.
    expect(snapshot.url).toBeDefined();
    expect(snapshot.hostname).toBeDefined();
    expect(snapshot.capturedAt).toBeDefined();
    expect(snapshot.http).toBeDefined();
    expect(snapshot.html).toBeDefined();
    expect(snapshot.resources).toBeDefined();
  });

  it('snapshot url can differ from ScanTarget url (redirects)', () => {
    const targetUrl = createUrl('https://example.com/original');
    const snapshot = makeSnapshot({
      url: createUrl('https://example.com/redirected'),
      http: {
        statusCode: createHttpStatus(200),
        headers: [],
        contentType: 'text/html',
        finalUrl: createUrl('https://example.com/redirected'),
      },
    });
    expect(snapshot.url).not.toBe(targetUrl);
    expect(snapshot.http.finalUrl).not.toBe(targetUrl);
  });
});
