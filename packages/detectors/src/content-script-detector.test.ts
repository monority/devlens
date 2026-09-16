import { describe, it, expect } from 'vitest';
import { ContentScriptDetector } from './content-script-detector.js';
import type { SiteSnapshot, ScriptTag } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

// ─── Test helpers ───────────────────────────────────────────────────

function makeSnapshot(scripts: Array<ScriptTag> = []): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'Example',
      description: null,
      metaTags: [],
      scripts,
      links: [],
    },
    resources: [],
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('ContentScriptDetector', () => {
  const detector = new ContentScriptDetector();

  describe('Next.js signatures', () => {
    it('__NEXT_DATA__ detects Next.js', () => {
      const snapshot = makeSnapshot([
        { src: null, content: 'window.__NEXT_DATA__ = {"props":{}};' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nextjs');
      expect(detections[0]!.technology.name).toBe('Next.js');
      expect(detections[0]!.technology.category).toBe('framework');
      expect(detections[0]!.confidence).toBe(95);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        type: 'script_content',
        snippet: '__NEXT_DATA__',
      });
    });

    it('next/router detects Next.js', () => {
      const snapshot = makeSnapshot([
        { src: null, content: "import { useRouter } from 'next/router';" },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nextjs');
      expect(detections[0]!.confidence).toBe(90);
    });

    it('next/navigation detects Next.js', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: "import { useRouter } from 'next/navigation';",
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nextjs');
      expect(detections[0]!.confidence).toBe(90);
    });
  });

  describe('React signatures', () => {
    it('react-dom detects React', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: "import ReactDOM from 'react-dom';",
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('react');
      expect(detections[0]!.technology.name).toBe('React');
      expect(detections[0]!.confidence).toBe(90);
    });

    it('ReactDOM detects React', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: 'ReactDOM.render(app, container);',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('react');
      expect(detections[0]!.confidence).toBe(90);
    });

    // ── createRoot( removed (P1 false positive) ──────────────────
    // The `createRoot(` signature was removed because `createRoot()`
    // is a generic DOM API call that appears in non-React code.
    // React is now detected solely via `react-dom` and `ReactDOM`.
  });

  describe('Vue signature', () => {
    it('Vue.createApp detects Vue.js', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: 'const app = Vue.createApp({ data() { return {}; } });',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('vue');
      expect(detections[0]!.technology.name).toBe('Vue.js');
      expect(detections[0]!.confidence).toBe(95);
    });
  });

  describe('Angular signatures', () => {
    it('@angular/core detects Angular', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: "import { Component } from '@angular/core';",
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('angular');
      expect(detections[0]!.technology.name).toBe('Angular');
      expect(detections[0]!.confidence).toBe(95);
    });

    it('platformBrowserDynamic detects Angular', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: 'platformBrowserDynamic().bootstrapModule(AppModule);',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('angular');
      expect(detections[0]!.confidence).toBe(90);
    });
  });

  describe('Svelte signatures', () => {
    it('SvelteComponent detects Svelte', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: 'class App extends SvelteComponent { mount() {} }',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('svelte');
      expect(detections[0]!.technology.name).toBe('Svelte');
      expect(detections[0]!.confidence).toBe(90);
    });

    it('__SVELTE__ detects Svelte', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: 'if (typeof __SVELTE__ !== "undefined") { init(); }',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('svelte');
      expect(detections[0]!.confidence).toBe(95);
    });
  });

  describe('Astro signature', () => {
    it('astro-island detects Astro', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: '<astro-island props="..."></astro-island>',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('astro');
      expect(detections[0]!.technology.name).toBe('Astro');
      expect(detections[0]!.confidence).toBe(95);
    });
  });

  describe('multiple inline scripts', () => {
    it('detects multiple technologies across different inline scripts', () => {
      const snapshot = makeSnapshot([
        { src: null, content: 'window.__NEXT_DATA__ = {};' },
        { src: null, content: "import ReactDOM from 'react-dom';" },
        { src: null, content: 'Vue.createApp({});' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(3);
      expect(detections[0]!.technology.id).toBe('nextjs');
      expect(detections[1]!.technology.id).toBe('react');
      expect(detections[2]!.technology.id).toBe('vue');
    });

    it('detects multiple technologies within a single inline script', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: "import ReactDOM from 'react-dom'; window.__NEXT_DATA__ = {};",
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(2);
      expect(detections[0]!.technology.id).toBe('nextjs');
      expect(detections[1]!.technology.id).toBe('react');
    });
  });

  describe('deduplication', () => {
    it('multiple signatures for one technology produce one Detection', () => {
      const snapshot = makeSnapshot([{ src: null, content: "import ReactDOM from 'react-dom';" }]);
      const detections = detector.detect(snapshot);

      // Both `react-dom` (90) and `ReactDOM` (90) match content
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('react');
    });

    it('selects the strongest confidence signature for duplicate technology signatures', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: 'class App extends SvelteComponent {} window.__SVELTE__ = true;',
        },
      ]);
      const detections = detector.detect(snapshot);

      // Both SvelteComponent (90) and __SVELTE__ (95) match content
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('svelte');
      expect(detections[0]!.confidence).toBe(95);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        type: 'script_content',
        snippet: '__SVELTE__',
      });
    });

    it('selects stronger confidence even when lower-confidence signature appears first in content', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: 'SvelteComponent; __SVELTE__',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('svelte');
      expect(detections[0]!.confidence).toBe(95);
    });
  });

  describe('script filtering', () => {
    it('ignores external scripts (src !== null)', () => {
      const snapshot = makeSnapshot([
        {
          src: 'https://example.com/react-dom.production.min.js',
          content: '',
        },
        {
          src: 'https://example.com/_next/static/chunks/main.js',
          content: '',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('ignores inline scripts with empty content', () => {
      const snapshot = makeSnapshot([
        { src: null, content: '' },
        { src: null, content: '   ' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('ignores scripts without fingerprints and detects those with', () => {
      const snapshot = makeSnapshot([
        { src: null, content: 'var x = 1; var y = 2;' },
        { src: null, content: 'window.__NEXT_DATA__ = {};' },
        { src: null, content: 'console.log("hello world");' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nextjs');
    });

    it('returns [] when scripts array is empty', () => {
      const snapshot = makeSnapshot([]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('handles a mix of inline and external scripts', () => {
      const snapshot = makeSnapshot([
        { src: 'https://cdn.example.com/react.production.min.js', content: '' },
        { src: null, content: 'Vue.createApp({});' },
        { src: 'https://cdn.example.com/bootstrap.min.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('vue');
    });
  });

  describe('case-insensitive matching', () => {
    it('matches __NEXT_DATA__ case-insensitively while preserving original snippet', () => {
      const snapshot = makeSnapshot([{ src: null, content: 'window.__next_data__ = {};' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nextjs');
      // Snippet preserves the original casing from the content
      expect(detections[0]!.evidence[0]!).toMatchObject({
        type: 'script_content',
        snippet: '__next_data__',
      });
    });

    it('matches react-dom case-insensitively', () => {
      const snapshot = makeSnapshot([{ src: null, content: "import * as rd from 'REACT-DOM';" }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('react');
      expect(detections[0]!.evidence[0]!).toMatchObject({
        type: 'script_content',
        snippet: 'REACT-DOM',
      });
    });
  });

  describe('evidence shape', () => {
    it('produces ScriptContentEvidence with correct structure', () => {
      const snapshot = makeSnapshot([{ src: null, content: 'window.__NEXT_DATA__ = {};' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.evidence).toHaveLength(1);
      expect(detections[0]!.evidence[0]!.type).toBe('script_content');
      expect(typeof detections[0]!.evidence[0]!.snippet).toBe('string');
      expect(detections[0]!.evidence[0]!.snippet).toBe('__NEXT_DATA__');
    });

    it('snippet contains only the matched fingerprint, not the full script', () => {
      const longContent =
        'const reallyLongVariableName = true; ' +
        'window.__NEXT_DATA__ = { very: "large", nested: { object: { a: 1 } } }; ' +
        'console.log("done");';
      const snapshot = makeSnapshot([{ src: null, content: longContent }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        type: 'script_content',
        snippet: '__NEXT_DATA__',
      });
      expect(detections[0]!.evidence[0]!.snippet).not.toContain('reallyLongVariableName');
      expect(detections[0]!.evidence[0]!.snippet).not.toContain('console.log');
    });
  });

  describe('false-positive cases (must NOT trigger)', () => {
    it('does not trigger on arbitrary variable named "vue"', () => {
      const snapshot = makeSnapshot([{ src: null, content: 'const framework = "vue";' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('does not trigger on arbitrary string containing "react"', () => {
      const snapshot = makeSnapshot([{ src: null, content: 'const text = "react";' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('does not trigger on generic createApp usage without Vue context', () => {
      const snapshot = makeSnapshot([{ src: null, content: 'const app = createApp({});' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('does not trigger on generic minified bundle content', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content:
            '!function(e,n){function t(r){if(i[r])return i[r];var o=i[r]={exports:{}};' +
            'return e[r].call(o.exports,o,o.exports,t)}var i=i||{}})',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });
  });

  // ─── Step 11: New technology signatures ──────────────────────────
  // Each new technology has a positive test (fingerprint present → detected)
  // and a negative test (fingerprint absent or generic → not detected).

  describe('Drupal signature', () => {
    it('drupalSettings detects Drupal', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: 'var drupalSettings = {"basePath":"/","drupal":{"modules":["file"]}}',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('drupal');
      expect(detections[0]!.technology.name).toBe('Drupal');
      expect(detections[0]!.technology.category).toBe('cms');
      expect(detections[0]!.confidence).toBe(90);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        type: 'script_content',
        snippet: 'drupalSettings',
      });
    });

    it('does not trigger on generic "settings" variable', () => {
      const snapshot = makeSnapshot([{ src: null, content: 'var settings = { theme: "dark" };' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('does not trigger on "drupal" in a comment (without drupalSettings)', () => {
      const snapshot = makeSnapshot([{ src: null, content: '// This site is not drupal' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });
  });

  describe('Laravel signature', () => {
    it('window.Laravel detects Laravel', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: 'window.Laravel = {"csrfToken":"abc","user":{"id":1}};',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('laravel');
      expect(detections[0]!.technology.name).toBe('Laravel');
      expect(detections[0]!.technology.category).toBe('framework');
      expect(detections[0]!.confidence).toBe(90);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        type: 'script_content',
        snippet: 'window.Laravel',
      });
    });

    it('does not trigger on generic "window" property access', () => {
      const snapshot = makeSnapshot([{ src: null, content: 'window.location = "/home";' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('does not trigger on "laravel" mentioned in a comment', () => {
      const snapshot = makeSnapshot([{ src: null, content: '/* laravel framework */ var x = 1;' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });
  });

  describe('Webflow signature', () => {
    it('Webflow. detects Webflow', () => {
      const snapshot = makeSnapshot([
        {
          src: null,
          content: 'Webflow.require("ix2").init();',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('webflow');
      expect(detections[0]!.technology.name).toBe('Webflow');
      expect(detections[0]!.technology.category).toBe('cms');
      expect(detections[0]!.confidence).toBe(90);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        type: 'script_content',
        snippet: 'Webflow.',
      });
    });

    it('does not trigger on "Webflow" mentioned in a comment', () => {
      const snapshot = makeSnapshot([{ src: null, content: '// built with Webflow' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('does not trigger on generic "workflow" substring (partial "Webflow" match)', () => {
      const snapshot = makeSnapshot([{ src: null, content: 'var workflow = "automated";' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });
  });
});
