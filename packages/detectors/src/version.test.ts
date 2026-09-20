/**
 * Unit tests for the declarative version-extraction primitive
 * (`@devlens/detectors`'s `extractVersion` + `@devlens/core`'s
 * `createTechnologyVersion` validator).
 *
 * These pin the Phase 2/3 contract:
 *   - extraction is deterministic & conservative (malformed/empty/no-match → null)
 *   - the captured text is boundary-validated (no fabrication, no throw)
 *   - capture-group selection respects an explicit `captureGroup`, otherwise
 *     falls back to group 1, then to the full match (group 0)
 */

import { describe, it, expect } from 'vitest';
import { createTechnologyVersion, type TechnologyVersion } from '@devlens/core';
import { extractVersion, type VersionExtraction } from './version.js';

/** Builds a `VersionExtraction` rule, optionally overriding the capture group and/or normalization. */
function rule(pattern: RegExp, captureGroup?: number, normalize?: 'version'): VersionExtraction {
  if (normalize === 'version') {
    return {
      source: 'matchedValue',
      rule: {
        pattern,
        normalize,
        ...(captureGroup !== undefined ? { captureGroup } : {}),
      },
    };
  }
  return captureGroup === undefined
    ? { source: 'matchedValue', rule: { pattern } }
    : { source: 'matchedValue', rule: { pattern, captureGroup } };
}

describe('extractVersion', () => {
  it('returns null when no version-extraction rule is declared', () => {
    expect(extractVersion('nginx/1.21.6', undefined)).toBeNull();
  });

  it('extracts the first capturing group from a matched observable value', () => {
    expect(extractVersion('nginx/1.21.6', rule(/nginx\/(\d+(?:\.\d+){0,2})/))).toBe('1.21.6');
    expect(extractVersion('PHP/8.2.10', rule(/php\/(\d+(?:\.\d+){0,2})/i))).toBe('8.2.10');
    expect(extractVersion('WordPress 6.4.2', rule(/wordpress\s+(\d+(?:\.\d+){0,2})/i))).toBe(
      '6.4.2',
    );
  });

  it('trims surrounding whitespace from the captured value via the validator', () => {
    // The capture group intentionally includes leading whitespace.
    expect(extractVersion('php/ 8.2', rule(/php\/(\s*\d+(?:\.\d+){0,2})/))).toBe('8.2');
  });

  it('returns null when the value does not match the pattern', () => {
    // "nginx" with no version suffix → no match.
    expect(extractVersion('nginx', rule(/nginx\/(\d+(?:\.\d+){0,2})/))).toBeNull();
    // A value for a completely different technology.
    expect(extractVersion('cloudflare', rule(/nginx\/(\d+(?:\.\d+){0,2})/))).toBeNull();
  });

  it('selects an explicit captureGroup (default is group 1)', () => {
    // group 2 ("2") is selected instead of group 1 ("1").
    expect(extractVersion('1.2.3', rule(/(\d+)\.(\d+)\.(\d+)/, 2))).toBe('2');
    // group 3 is selectable too.
    expect(extractVersion('1.2.3', rule(/(\d+)\.(\d+)\.(\d+)/, 3))).toBe('3');
  });

  it('falls back to the full match (group 0) when the pattern has no capture group', () => {
    // No capturing group → the full regex match is used as the version.
    // `[\d.]+` greedily spans the whole dotted version token.
    expect(extractVersion('nginx/1.21.6', rule(/nginx\/[\d.]+/))).toBe('nginx/1.21.6');
    expect(extractVersion('nginx/1.25.2 (Ubuntu)', rule(/nginx\/[\d.]+/))).toBe('nginx/1.25.2');
  });

  it('returns null when the captured text is empty (validator rejects empty)', () => {
    expect(extractVersion('nginx/', rule(/nginx\/(\d*)/))).toBeNull();
  });

  it('returns null when the captured text is whitespace-only (validator rejects empty after trim)', () => {
    expect(extractVersion('   ', rule(/(\s+)/))).toBeNull();
  });

  it('returns null when the captured text exceeds 64 characters', () => {
    const long = '1'.repeat(65);
    expect(extractVersion(`nginx/${long}`, rule(/nginx\/(\d+)/))).toBeNull();
    // ...but 64 characters is accepted (boundary).
    const max = '1'.repeat(64);
    expect(extractVersion(`nginx/${max}`, rule(/nginx\/(\d+)/))).toBe(max);
  });

  it('does NOT fabricate a version when only part of a token looks version-like', () => {
    // "nginx" alone must not yield "nginx" as a version via a versioned rule
    // that requires the `/<version>` shape.
    expect(extractVersion('nginx', rule(/nginx\/(\d+(?:\.\d+){0,2})/))).toBeNull();
  });

  it('is deterministic (same input → same output)', () => {
    const value = 'WordPress 6.4.2';
    const spec = rule(/wordpress\s+(\d+(?:\.\d+){0,2})/i);
    const first: TechnologyVersion | null = extractVersion(value, spec);
    const second: TechnologyVersion | null = extractVersion(value, spec);
    expect(first).toBe(second);
    expect(first).toBe('6.4.2');
  });

  it('never throws on malformed/empty input', () => {
    expect(() => extractVersion('', rule(/nginx\/(\d+)/))).not.toThrow();
    expect(extractVersion('', rule(/nginx\/(\d+)/))).toBeNull();
  });
});

describe('createTechnologyVersion (validator contract)', () => {
  it('accepts canonical version strings (any non-empty single-line ≤ 64-char string)', () => {
    expect(createTechnologyVersion('6.4.2')).toBe('6.4.2');
    expect(createTechnologyVersion('10.0')).toBe('10.0');
    expect(createTechnologyVersion('8.2.10')).toBe('8.2.10');
    expect(createTechnologyVersion('4.17.21')).toBe('4.17.21');
    expect(createTechnologyVersion('2.4.41')).toBe('2.4.41');
  });

  it('trims surrounding whitespace', () => {
    expect(createTechnologyVersion('   6.4.2   ')).toBe('6.4.2');
  });

  it('rejects the empty string', () => {
    expect(() => createTechnologyVersion('')).toThrow(/must not be empty/);
  });

  it('rejects whitespace-only strings', () => {
    expect(() => createTechnologyVersion('   ')).toThrow(/must not be empty/);
  });

  it('rejects multi-line input', () => {
    expect(() => createTechnologyVersion('6.4\n2')).toThrow(/single line/);
  });

  it('rejects input over 64 characters', () => {
    expect(() => createTechnologyVersion('1'.repeat(65))).toThrow(/at most 64/);
  });

  it('accepts input of exactly 64 characters (boundary)', () => {
    expect(createTechnologyVersion('1'.repeat(64))).toHaveLength(64);
  });

  it('§9 — rejects reserved placeholder words (never fabricate a version)', () => {
    // `latest`/`unknown`/`current` carry no version information — a
    // signature that captured them must surface a real, concrete value.
    expect(() => createTechnologyVersion('latest')).toThrow(/reserved/);
    expect(() => createTechnologyVersion('unknown')).toThrow(/reserved/);
    expect(() => createTechnologyVersion('current')).toThrow(/reserved/);
    // case-insensitive
    expect(() => createTechnologyVersion('LATEST')).toThrow(/reserved/);
  });

  it('rejects non-string input', () => {
    expect(() => createTechnologyVersion(42 as unknown as string)).toThrow(/must be a string/);
    expect(() => createTechnologyVersion(null as unknown as string)).toThrow(/must be a string/);
    expect(() => createTechnologyVersion(undefined as unknown as string)).toThrow(
      /must be a string/,
    );
  });
});

describe('Step 72 — extraction hardening (§7 try/catch, §8 normalization, §9 reserved words)', () => {
  it('§7 — a pattern whose match throws never crashes the scan (returns null)', () => {
    // §26 validation guarantees catalog patterns are real `RegExp` instances,
    // but `extractVersion` is a boundary primitive, so a pattern that throws
    // during matching must be contained to `null`. A constructed RegExp can't
    // throw on `.match`, so we exercise the guard with a `[Symbol.match]` stub.
    const throwingPattern = {
      // A constructed RegExp can't throw on `.match`, so we exercise the §7
      // guard with an object exposing `[Symbol.match]` that throws. The
      // parameter is intentionally ignored (it's never reached).
      [Symbol.match](): never {
        throw new Error('regex threw');
      },
    } as unknown as RegExp;
    expect(extractVersion('anything', rule(throwingPattern))).toBeNull();
  });

  it('§8 — normalize: strips a leading v/V prefix', () => {
    // The capturing group intentionally INCLUDES the prefix, so normalize
    // has real work to do (the prefix would otherwise survive into the
    // version). captureGroup defaults to 1 here.
    const sig = rule(/(v?\d+(?:\.\d+){0,2})/, undefined, 'version');
    expect(extractVersion('v3.7.1', sig)).toBe('3.7.1');
    expect(extractVersion('V10.0', sig)).toBe('10.0');
    expect(extractVersion('3.7.1', sig)).toBe('3.7.1');
  });

  it('§8 — normalize: strips a leading "version" word (case-insensitive) + whitespace', () => {
    const sig = rule(/(version\s*v?\d+(?:\.\d+){0,2})/i, undefined, 'version');
    expect(extractVersion('version 3.7.1', sig)).toBe('3.7.1');
    expect(extractVersion('VERSION 3.7.1', sig)).toBe('3.7.1');
    expect(extractVersion('Version  17.0.2', sig)).toBe('17.0.2');
  });

  it('§8 — normalize is opt-in (default off preserves the captured text verbatim)', () => {
    const off = rule(/(v?\d+(?:\.\d+){0,2})/);
    expect(extractVersion('v3.7.1', off)).toBe('v3.7.1');
  });

  it('§9 — rejected captures (reserved/empty/oversized) yield null via extractVersion', () => {
    const sig = rule(/(\w+)/);
    // reserved placeholder words → createTechnologyVersion rejects → null
    expect(extractVersion('latest', sig)).toBeNull();
    expect(extractVersion('UNKNOWN', sig)).toBeNull();
    expect(extractVersion('current', sig)).toBeNull();
    // empty capture (after trim) → null
    expect(extractVersion('x', rule(/(\s*)/))).toBeNull();
    // oversized capture (> 64) → null
    expect(extractVersion(`x ${'9'.repeat(65)}`, rule(/(\d+)/))).toBeNull();
  });
});
