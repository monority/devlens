/**
 * Unit tests for the DetectionItem component.
 *
 * Uses `renderToString` — no DOM environment required.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DetectionItem } from './DetectionItem';
import type { DetectionResponse, DetectionExplainability } from '../lib/types.js';
import { getDetectionExplainability } from '../lib/detection-explainability';

describe('DetectionItem', () => {
  const makeDetection = (overrides: Partial<DetectionResponse> = {}): DetectionResponse => ({
    technology: { id: 'react', name: 'React', category: 'frontend' },
    confidence: 95,
    evidence: [{ type: 'script_url', url: 'https://cdn.example.com/react.js' }],
    ...overrides,
  });

  it('renders technology name', () => {
    const html = renderToString(
      React.createElement(DetectionItem, { detection: makeDetection(), index: 0 }),
    );

    expect(html).toContain('React');
  });

  it('renders technology category', () => {
    const html = renderToString(
      React.createElement(DetectionItem, { detection: makeDetection(), index: 0 }),
    );

    expect(html).toContain('frontend');
  });

  it('renders confidence score exactly as returned by the API', () => {
    const html = renderToString(
      React.createElement(DetectionItem, { detection: makeDetection(), index: 0 }),
    );

    expect(html).toContain('95');
    expect(html).toContain('Confidence');
    // Phase 4: confidence is a 0–100 ranking score, NOT a probability —
    // it must never carry a '%' suffix (e.g. no "95%").
    expect(html).not.toContain('95%');
  });

  it('never renders confidence as a probability (no "%" suffix)', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({ confidence: 87 }),
        index: 0,
      }),
    );

    // The raw score is present, but never as a percentage.
    expect(html).toContain('87');
    expect(html).not.toContain('87%');
    expect(html).not.toContain('Confidence: 87%');
  });

  it('renders evidence count', () => {
    const detection: DetectionResponse = {
      technology: { id: 'react', name: 'React', category: 'frontend' },
      confidence: 95,
      evidence: [
        { type: 'http_header', name: 'X-Powered-By', value: 'React' },
        { type: 'meta_tag', name: 'generator', content: 'React 19' },
      ],
    };
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('2 evidence items');
  });

  it('renders singular "item" for a single evidence entry', () => {
    const detection = makeDetection();
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('1 evidence item');
  });

  it('renders evidence items inside the detection', () => {
    const html = renderToString(
      React.createElement(DetectionItem, { detection: makeDetection(), index: 0 }),
    );

    expect(html).toContain('Script URL');
    expect(html).toContain('https://cdn.example.com/react.js');
  });

  it('preserves exact confidence value without rounding', () => {
    const detection = makeDetection({ confidence: 87 });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    expect(html).toContain('87');
  });

  it('does not introduce subjective labels', () => {
    const detection = makeDetection({ confidence: 30 });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    // No subjective labels like "weak", "likely", "excellent"
    expect(html).not.toContain('weak');
    expect(html).not.toContain('likely');
    expect(html).not.toContain('excellent');
    // But the raw confidence should still appear.
    expect(html).toContain('30');
  });
});

describe('DetectionItem — Step 33 explanation', () => {
  const makeDetection = (overrides: Partial<DetectionResponse> = {}): DetectionResponse => ({
    technology: { id: 'react', name: 'React', category: 'frontend' },
    confidence: 95,
    evidence: [{ type: 'script_url', url: 'https://cdn.example.com/react.js' }],
    ...overrides,
  });

  it('renders the detected-because reasons list', () => {
    const detection = makeDetection({
      evidence: [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'WordPress' },
      ],
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const decoded = html.replace(/&#x27;/g, "'");

    expect(decoded).toContain('Detected because');
    // Each evidence item is rendered as a reason line with its matched value.
    expect(decoded).toContain("HTTP header 'Server' — matched 'nginx'");
    expect(decoded).toContain("Meta tag 'generator' — matched 'WordPress'");
    expect(decoded).toContain('matched');
  });

  it('preserves exact confidence value in the explanation', () => {
    const detection = makeDetection({ confidence: 87 });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    // Confidence should still appear as-is
    expect(html).toContain('87');
  });

  it('renders evidence-source summary with type labels', () => {
    const detection = makeDetection({
      evidence: [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'WordPress' },
        { type: 'script_url', url: 'https://cdn.example.com/app.js' },
      ],
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    expect(html).toContain('HTTP Header');
    expect(html).toContain('Meta Tag');
    expect(html).toContain('Script URL');
  });

  it('renders "No direct evidence available." for zero evidence', () => {
    const detection = makeDetection({ evidence: [] });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    expect(html).toContain('No direct evidence available.');
  });

  it('preserves known technology link to catalog', () => {
    const detection = makeDetection({
      technology: { id: 'nginx', name: 'nginx', category: 'server' },
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    // Known technology should link to /technologies/nginx
    expect(html).toContain('href="/technologies/nginx"');
    expect(html).toContain('nginx');
  });

  it('renders unknown technology name as plain text (no link)', () => {
    const detection = makeDetection({
      technology: { id: 'unknown-tech', name: 'Unknown Tech', category: 'unknown' },
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    // Should NOT link to /technologies/unknown-tech
    expect(html).not.toContain('/technologies/unknown-tech');
    // But the name should still be visible
    expect(html).toContain('Unknown Tech');
  });

  it('uses canonical technology ID in link (not display name)', () => {
    const detection = makeDetection({
      technology: { id: 'react', name: 'React.js', category: 'frontend' },
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    // Link must use the canonical ID ('react'), not the display name
    expect(html).toContain('href="/technologies/react"');
    expect(html).not.toContain('href="/technologies/React.js"');
    // Display name should still be visible as link text
    expect(html).toContain('React.js');
  });

  it('preserves detection information when technology is linked', () => {
    const detection = makeDetection({
      technology: { id: 'nginx', name: 'nginx', category: 'server' },
      confidence: 80,
      evidence: [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'WordPress' },
      ],
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Technology name is rendered (as a link)
    expect(cleaned).toContain('nginx');
    // Category is visible
    expect(cleaned).toContain('server');
    // Confidence is visible
    expect(cleaned).toContain('80');
    expect(cleaned).toContain('Confidence');
    // Evidence count is visible
    expect(cleaned).toContain('2 evidence items');
  });

  it('existing evidence disclosure still works (collapsible tree)', () => {
    const detection = makeDetection({
      evidence: [{ type: 'script_url', url: 'https://cdn.example.com/react.js' }],
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Evidence disclosure should still be present
    expect(cleaned).toContain('Evidence (1)');
  });

  it('renders all eight evidence types without crashing', () => {
    const detection = makeDetection({
      evidence: [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'WordPress' },
        { type: 'script_url', url: 'https://cdn.example.com/app.js' },
        { type: 'script_content', snippet: 'window.foo' },
        { type: 'html', selector: '#app', snippet: '<div>' },
        { type: 'javascript_global', globalName: 'React' },
        { type: 'resource', url: 'https://cdn.example.com/logo.png' },
        { type: 'link', url: 'https://cdn.example.com/style.css' },
      ],
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    expect(html).toContain('HTTP Header');
    expect(html).toContain('Meta Tag');
    expect(html).toContain('Script URL');
    expect(html).toContain('Script Content');
    expect(html).toContain('HTML Element');
    expect(html).toContain('JavaScript Global');
    expect(html).toContain('Resource URL');
    expect(html).toContain('Link');
  });
});

describe('DetectionItem — Step 39 explainability', () => {
  const makeDetection = (overrides: Partial<DetectionResponse> = {}): DetectionResponse => ({
    technology: { id: 'react', name: 'React', category: 'frontend' },
    confidence: 95,
    evidence: [{ type: 'script_url', url: 'https://cdn.example.com/react.js' }],
    ...overrides,
  });

  it('renders evidence source descriptions', () => {
    const detection = makeDetection({
      evidence: [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'script_url', url: 'https://cdn.example.com/react.js' },
      ],
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    // React renderToString escapes single quotes as &#x27; in text content
    const decoded = html.replace(/&#x27;/g, "'");

    // Source descriptions derived from evidence fields
    expect(decoded).toContain("HTTP header 'Server'");
    expect(decoded).toContain("Script from 'https://cdn.example.com/react.js'");
  });

  it('renders evidence source type labels', () => {
    const detection = makeDetection({
      evidence: [{ type: 'html', selector: '#app', snippet: '<div>' }],
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const decoded = html.replace(/&#x27;/g, "'");

    expect(html).toContain('HTML Element');
    expect(decoded).toContain("HTML element at '#app'");
  });

  it('wraps long evidence values with title attribute for full value', () => {
    const longValue = 'x'.repeat(500);
    const detection = makeDetection({
      evidence: [{ type: 'http_header', name: longValue, value: 'nginx' }],
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    // Full value should be available in the title attribute
    expect(html).toContain(`title="${longValue}: nginx"`);
  });

  it('renders evidence source list for all evidence types', () => {
    const detection = makeDetection({
      evidence: [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'Hugo' },
        { type: 'script_url', url: 'https://cdn.example.com/app.js' },
        { type: 'script_content', snippet: 'window.foo' },
        { type: 'html', selector: '#app', snippet: '<div>' },
        { type: 'javascript_global', globalName: 'React' },
        { type: 'resource', url: 'https://cdn.example.com/logo.png' },
        { type: 'link', url: 'https://cdn.example.com/style.css' },
      ],
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const decoded = html.replace(/&#x27;/g, "'");

    expect(decoded).toContain("HTTP header 'Server'");
    expect(decoded).toContain("Meta tag 'generator'");
    expect(decoded).toContain("Script from 'https://cdn.example.com/app.js'");
    expect(html).toContain('JavaScript snippet');
    expect(decoded).toContain("HTML element at '#app'");
    expect(decoded).toContain("JavaScript global 'React'");
    expect(decoded).toContain("Resource at 'https://cdn.example.com/logo.png'");
    expect(decoded).toContain("Link to 'https://cdn.example.com/style.css'");
  });

  it('preserves confidence in explainability rendering', () => {
    const detection = makeDetection({ confidence: 87 });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    expect(html).toContain('87');
    expect(html).toContain('Confidence');
  });

  it('handles zero evidence (no source list, no crash)', () => {
    const detection = makeDetection({ evidence: [] });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    // Should not contain evidence source items
    expect(html).not.toContain("HTTP header '");
    expect(html).toContain('No direct evidence available.');
  });

  it('deduplicates evidence in the rendered output', () => {
    const detection = makeDetection({
      evidence: [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'http_header', name: 'Server', value: 'Apache' },
      ],
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // The exact nginx duplicate collapses to one, but Server:Apache is a
    // distinct evidence item (canonical identity includes the value) → 2
    expect(cleaned).toContain('2 evidence items');
    // Both values must survive rendering (no silent evidence loss)
    expect(cleaned).toContain('Server: nginx');
    expect(cleaned).toContain('Server: Apache');
  });

  it('renders evidence sources in deterministic order (type ASC → identity ASC)', () => {
    const detection = makeDetection({
      evidence: [
        { type: 'script_url', url: 'https://cdn.example.com/z.js' },
        { type: 'http_header', name: 'X-Powered-By', value: 'React' },
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ],
    });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const decoded = html.replace(/&#x27;/g, "'");

    // Order: HTTP Header (Server) → HTTP Header (X-Powered-By) → Script URL
    const serverPos = decoded.indexOf("HTTP header 'Server'");
    const poweredByPos = decoded.indexOf("HTTP header 'X-Powered-By'");
    const scriptPos = decoded.indexOf('Script from');

    expect(serverPos).toBeGreaterThan(-1);
    expect(poweredByPos).toBeGreaterThan(-1);
    expect(scriptPos).toBeGreaterThan(-1);
    expect(serverPos).toBeLessThan(poweredByPos);
    expect(poweredByPos).toBeLessThan(scriptPos);
  });
});

describe('DetectionItem — version rendering', () => {
  const makeDetection = (overrides: Partial<DetectionResponse> = {}): DetectionResponse => ({
    technology: { id: 'nginx', name: 'nginx', category: 'server' },
    confidence: 95,
    evidence: [{ type: 'http_header', name: 'Server', value: 'nginx/1.21.6' }],
    ...overrides,
  });

  it('renders the version when the detection carries one', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({ version: '1.21.6' }),
        index: 0,
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Version: 1.21.6');
  });

  it('omits the version entirely when the detection has no version', () => {
    const html = renderToString(
      React.createElement(DetectionItem, { detection: makeDetection(), index: 0 }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).not.toContain('Version:');
  });

  it('never renders a version with a percent suffix (version is not a probability)', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({ version: '6.4.2' }),
        index: 0,
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Version: 6.4.2');
    expect(cleaned).not.toContain('6.4.2%');
    expect(cleaned).not.toContain('Version: 6.4.2%');
  });

  it('version is subordinate to technology name, confidence, and evidence', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({ version: '1.21.6' }),
        index: 0,
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // Primary signals still render...
    expect(cleaned).toContain('nginx');
    expect(cleaned).toContain('Confidence: 95');
    expect(cleaned).toContain('HTTP Header');
    // ...and the version renders alongside them.
    expect(cleaned).toContain('Version: 1.21.6');
  });
});

describe('DetectionItem — Step 69 derived & conflict rendering', () => {
  const makeDetection = (overrides: Partial<DetectionResponse> = {}): DetectionResponse => ({
    technology: { id: 'react', name: 'React', category: 'frontend' },
    confidence: 0,
    evidence: [],
    ...overrides,
  });

  it('renders a "Derived from … (implies)" banner for a relationship-derived detection', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          technology: { id: 'react', name: 'React', category: 'frontend' },
          source: 'relationship',
          derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
        }),
        index: 0,
      }),
    );

    expect(html).toContain('Derived from');
    expect(html).toContain('Next.js (implies)');
  });

  it('renders no derived banner for a direct (directly-observed) detection', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          confidence: 95,
          evidence: [{ type: 'script_url', url: 'https://cdn.example.com/react.js' }],
        }),
        index: 0,
      }),
    );

    expect(html).not.toContain('Derived from');
    expect(html).not.toContain('Conflict:');
  });

  it('renders a requires conflict banner', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          confidence: 85,
          evidence: [{ type: 'script_url', url: 'https://example.com/wc/cart.min.js' }],
          relationshipConflicts: [
            { type: 'requires', other: 'wordpress', reason: 'missing_requirement' },
          ],
        }),
        index: 0,
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Conflict: requires (wordpress)');
  });

  it('renders an excludes conflict banner', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          confidence: 90,
          evidence: [{ type: 'http_header', name: 'Server', value: 'nginx' }],
          relationshipConflicts: [
            { type: 'excludes', other: 'vercel', reason: 'both_directly_observed' },
          ],
        }),
        index: 0,
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Conflict: excludes (vercel)');
  });

  it('still renders the zero-evidence state for a derived detection', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          source: 'relationship',
          derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
        }),
        index: 0,
      }),
    );

    expect(html).toContain('No direct evidence available.');
    // And the derived banner, so it is never mistaken for a direct detection.
    expect(html).toContain('Derived from');
  });

  it('renders both a derived banner and a conflict on the same direct detection', () => {
    // A direct detection can carry both a derived-banner-style marker is
    // impossible (direct ⇒ no source), but it CAN carry a conflict. This
    // guards that a conflicted DIRECT detection never shows a derived
    // banner while still showing its conflict.
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          confidence: 85,
          evidence: [{ type: 'script_url', url: 'https://example.com/wc/cart.min.js' }],
          relationshipConflicts: [
            { type: 'requires', other: 'wordpress', reason: 'missing_requirement' },
          ],
        }),
        index: 0,
      }),
    );

    expect(html).not.toContain('Derived from');
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('Conflict: requires (wordpress)');
  });
});

describe('DetectionItem — Step 73 explainability rendering', () => {
  // Local helper (mirrors the parent describe's makeDetection) so this block
  // is self-contained and does not depend on the enclosing describe's scope.
  const makeDetection = (overrides: Partial<DetectionResponse> = {}): DetectionResponse => ({
    technology: { id: 'nginx', name: 'nginx', category: 'server' },
    confidence: 80,
    evidence: [{ type: 'http_header', name: 'Server', value: 'nginx' }],
    ...overrides,
  });

  it('renders a relationship-derived reason in the "Detected because" list', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          evidence: [],
          source: 'relationship',
          derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
        }),
        index: 0,
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'");

    expect(cleaned).toContain('Detected because');
    expect(cleaned).toContain('Derived from Next.js');
    expect(cleaned).toContain('(implies)');
  });

  it('renders version-conflict detail from disagreeing evidence', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          evidence: [{ type: 'http_header', name: 'Server', value: '18.2.0' }],
          version: null,
          versionConflict: true,
          versionEvidence: [
            { type: 'http_header', name: 'Server', value: '18.2.0' },
            { type: 'http_header', name: 'Server', value: '18.3.1' },
          ],
        }),
        index: 0,
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Version evidence is inconsistent');
    expect(cleaned).toContain('HTTP Header');
    // Per-observation extracted versions are NOT persisted → the disagreeing
    // evidence values are shown instead (never a fabricated version string).
    expect(cleaned).toContain('18.2.0');
    expect(cleaned).toContain('18.3.1');
  });

  it('renders resource_content evidence in the reasons list', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          evidence: [
            {
              type: 'resource_content',
              url: 'https://cdn.example.com/main.js',
              resourceType: 'script',
              match: 'ng.version',
              snippet: 'ng',
            },
          ],
        }),
        index: 0,
      }),
    );
    const decoded = html.replace(/&#x27;/g, "'");

    expect(decoded).toContain('Detected because');
    expect(decoded).toContain('Resource Content');
    expect(decoded).toContain("Resource content at 'https://cdn.example.com/main.js'");
    expect(decoded).toContain("matched 'ng.version'");
  });

  it('renders "No direct evidence available." for a direct detection with no evidence', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({ evidence: [] }),
        index: 0,
      }),
    );

    expect(html).toContain('No direct evidence available.');
  });
});

describe('DetectionItem — Step 76 signal quality rendering', () => {
  const makeDetection = (overrides: Partial<DetectionResponse> = {}): DetectionResponse => ({
    technology: { id: 'react', name: 'React', category: 'frontend' },
    confidence: 95,
    evidence: [{ type: 'script_url', url: 'https://cdn.example.com/react.js' }],
    ...overrides,
  });

  it('renders a compact single-signal quality line (§10)', () => {
    const html = renderToString(
      React.createElement(DetectionItem, { detection: makeDetection(), index: 0 }),
    );

    expect(html).toContain('Single signal');
    expect(html).toContain('1 source');
    // A signal-quality line must never look like a probability.
    expect(html).not.toContain('%');
  });

  it('renders a compact multi-source quality line (§10)', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          evidence: [
            { type: 'http_header', name: 'X-Powered-By', value: 'React' },
            { type: 'meta_tag', name: 'generator', content: 'React 19' },
          ],
        }),
        index: 0,
      }),
    );

    expect(html).toContain('Multi-source');
    expect(html).toContain('2 sources');
    expect(html).not.toContain('%');
  });

  it('renders "Derived · no direct evidence" for a relationship-derived detection (§11)', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          evidence: [],
          source: 'relationship',
          derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
        }),
        index: 0,
      }),
    );

    expect(html).toContain('Derived');
    expect(html).toContain('no direct evidence');
  });
});

// Step 77 §14 — presentation of confidence · signal quality · provenance.
describe('DetectionItem — Step 77 presentation (confidence · signal quality · provenance)', () => {
  const mk = (overrides: Partial<DetectionResponse> = {}): DetectionResponse => ({
    technology: { id: 'react', name: 'React', category: 'frontend' },
    confidence: 95,
    evidence: [{ type: 'script_url', url: 'https://cdn.example.com/react.js' }],
    ...overrides,
  });
  const explanationWithoutSq = (detection: DetectionResponse): DetectionExplainability => {
    const full = getDetectionExplainability(detection);
    const legacy: DetectionExplainability = { ...full };
    // Simulate a legacy API response whose explanation predates signal
    // quality (Step 76) — the field is simply absent.
    delete legacy.signalQuality;
    return legacy;
  };

  it('renders a combined confidence · signal-quality · provenance header (§6)', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: mk({
          confidence: 100,
          evidence: [
            { type: 'script_url', url: 'https://cdn.example.com/react.js' },
            { type: 'http_header', name: 'X-Powered-By', value: 'React' },
            { type: 'meta_tag', name: 'generator', content: 'React' },
          ],
        }),
        index: 0,
      }),
    );

    expect(html).toContain('Confidence: 100 · Strong · 3 sources · Direct');
    expect(html).toContain('Confidence: 100');
    expect(html).not.toContain('%');
  });

  it('renders a combined header for a single-signal direct detection', () => {
    const html = renderToString(
      React.createElement(DetectionItem, { detection: mk({ confidence: 95 }), index: 0 }),
    );

    expect(html).toContain('Confidence: 95 · Single signal · 1 source · Direct');
  });

  it('renders "Derived · no direct evidence" in the combined header (§10)', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: mk({
          confidence: 0,
          source: 'relationship',
          derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
          evidence: [],
        }),
        index: 0,
      }),
    );

    expect(html).toContain('Confidence: 0 · Derived · no direct evidence');
    expect(html).toContain('no direct evidence');
    expect(html).not.toContain('Strong');
    expect(html).not.toContain('%');
  });

  it('renders a "No direct evidence available." body for relationship-only detections', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: mk({
          confidence: 0,
          source: 'relationship',
          derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
          evidence: [],
        }),
        index: 0,
      }),
    );

    expect(html).toContain('No direct evidence available.');
    expect(html).toContain('no direct evidence'); // lowercase, from the combined header
    expect(html).not.toContain('%');
  });

  it('renders the version subordinate to the combined header (§6 version is secondary)', () => {
    // `renderToString` inserts `<!-- -->` between "Version:" and the value,
    // so assert them as separate substrings (comment-safe).
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: mk({ confidence: 95, version: '6.4.2' }),
        index: 0,
      }),
    );

    expect(html).toContain('Confidence: 95 · Single signal · 1 source · Direct');
    expect(html).toContain('Version:');
    expect(html).toContain('6.4.2');
    expect(html).not.toContain('95%');
  });

  it('falls back to a provenance-only line when the API omits signalQuality (legacy)', () => {
    const detection = mk({ explanation: explanationWithoutSq(mk()) });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    expect(html).toContain('Confidence: 95 · Direct');
    expect(html).not.toContain('%');
  });
});

// Step 80 §14 — minimal provenance surface proving the `DetectionResponse.provenance`
// contract is consumed by the UI.
describe('DetectionItem — Step 80 provenance (signals line)', () => {
  const makeDetection = (overrides: Partial<DetectionResponse> = {}): DetectionResponse =>
    ({
      technology: { id: 'nginx', name: 'nginx', category: 'server' },
      confidence: 80,
      evidence: [{ type: 'http_header', name: 'Server', value: 'nginx' }],
      ...overrides,
    }) as DetectionResponse;

  it('renders the "N signals" line with type labels', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          evidence: [
            { type: 'http_header', name: 'Server', value: 'nginx' },
            { type: 'meta_tag', name: 'generator', content: 'nginx' },
            { type: 'script_url', url: 'https://cdn.example.com/app.js' },
          ],
          provenance: {
            evidenceCount: 3,
            evidenceTypes: ['http_header', 'meta_tag', 'script_url'],
            strongestEvidenceType: 'http_header',
          },
        }),
        index: 0,
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('3 signals');
    expect(cleaned).toContain('HTTP Header');
    expect(cleaned).toContain('Meta Tag');
    expect(cleaned).toContain('Script URL');
  });

  it('renders the singular form for a single evidence type', () => {
    const html = renderToString(
      React.createElement(DetectionItem, {
        detection: makeDetection({
          provenance: {
            evidenceCount: 1,
            evidenceTypes: ['script_url'],
            strongestEvidenceType: 'script_url',
          },
        }),
        index: 0,
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('1 signal');
  });

  it('omits the signals line when provenance is absent', () => {
    const html = renderToString(
      React.createElement(DetectionItem, { detection: makeDetection(), index: 0 }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).not.toContain('signals');
  });
});
