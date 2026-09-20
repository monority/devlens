/**
 * Phase 13 — catalog validation guard tests.
 *
 * The real catalog (assembled from `catalog/technologies/*.ts`) must pass
 * `validateCatalog` with zero errors, and the guard must reject every
 * documented class of malformed definition so a broken per-tech file fails
 * loudly at startup rather than silently degrading detection.
 *
 * `validateDefinition` / `validateDefinitions` are pure functions that accept
 * an arbitrary list of definitions, so the negative cases below feed crafted
 * (type-cast) inputs instead of mocking the module.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCatalog,
  validateDefinition,
  validateDefinitions,
  TECHNOLOGY_DEFINITIONS,
} from './catalog/index.js';
import { TECHNOLOGY_IDS } from './technology-catalog.js';
import type { TechnologyDefinition } from './catalog/types.js';

// A minimal well-formed definition used as a template for the negative cases.
const baseDef = {
  id: 'test-tech',
  name: 'Test Tech',
  category: 'server',
  headerSignatures: [
    { headerName: 'server', matchValue: 'test', technologyId: 'test-tech', confidence: 90 },
  ],
} as unknown as TechnologyDefinition;

describe('validateCatalog — real catalog', () => {
  it('the production catalog has zero validation errors', () => {
    expect(validateCatalog()).toEqual([]);
  });

  it('has exactly 54 technology definitions (32 Step-67 + 22 Step-68)', () => {
    expect(TECHNOLOGY_DEFINITIONS).toHaveLength(54);
  });

  it('exposes 54 unique ids', () => {
    expect(TECHNOLOGY_IDS.size).toBe(54);
    expect(Array.from(TECHNOLOGY_IDS).sort()).toEqual(
      Array.from(new Set(Array.from(TECHNOLOGY_IDS))).sort(),
    );
  });

  it('every definition is referenced by id exactly once and has ≥1 signature', () => {
    const allSigs = (d: TechnologyDefinition) =>
      (d.headerSignatures ?? [])
        .concat(d.metaSignatures ?? [])
        .concat(d.scriptUrlSignatures ?? [])
        .concat(d.contentSignatures ?? [])
        .concat(d.resourceSignatures ?? [])
        .concat(d.linkSignatures ?? []);
    for (const def of TECHNOLOGY_DEFINITIONS) {
      expect(TECHNOLOGY_IDS.has(def.id)).toBe(true);
      expect(allSigs(def).length).toBeGreaterThan(0);
      for (const sig of allSigs(def)) {
        expect(sig.technologyId).toBe(def.id);
      }
    }
  });

  it('the 22 Step-68 technologies are present', () => {
    const ids = new Set(TECHNOLOGY_IDS);
    for (const id of [
      'caddy',
      'openresty',
      'litespeed',
      'tomcat',
      'fastly',
      'vercel',
      'typo3',
      'joomla',
      'craft-cms',
      'mediawiki',
      'google-tag-manager',
      'matomo',
      'segment',
      'htmx',
      'turbo',
      'stimulus',
      'alpinejs',
      'bigcommerce',
      'd3',
      'popperjs',
      'ember',
      'backbone',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });
});

describe('validateDefinition — rejects malformed definitions', () => {
  it('flags an empty id', () => {
    const def = { ...baseDef, id: '' } as unknown as TechnologyDefinition;
    expect(validateDefinition(def).some((e) => /empty id/.test(e))).toBe(true);
  });

  it('flags an empty name', () => {
    const def = { ...baseDef, name: '  ' } as unknown as TechnologyDefinition;
    expect(validateDefinition(def).some((e) => /empty name/.test(e))).toBe(true);
  });

  it('flags an empty category', () => {
    const def = { ...baseDef, category: '' } as unknown as TechnologyDefinition;
    expect(validateDefinition(def).some((e) => /empty category/.test(e))).toBe(true);
  });

  it('flags a signature whose technologyId does not match the definition', () => {
    const def = {
      ...baseDef,
      headerSignatures: [
        { headerName: 'server', matchValue: 'x', technologyId: 'wrong-id', confidence: 90 },
      ],
    } as unknown as TechnologyDefinition;
    expect(validateDefinition(def).some((e) => /technologyId is/.test(e))).toBe(true);
  });

  it('flags an exact-duplicate signature within a definition', () => {
    const sig = {
      headerName: 'server',
      matchValue: 'x',
      technologyId: 'test-tech',
      confidence: 90,
    };
    const def = { ...baseDef, headerSignatures: [sig, sig] } as unknown as TechnologyDefinition;
    expect(validateDefinition(def).some((e) => /duplicate signature/.test(e))).toBe(true);
  });

  it('flags a definition with zero signatures', () => {
    const def = {
      id: 'empty',
      name: 'Empty',
      category: 'server',
    } as unknown as TechnologyDefinition;
    expect(validateDefinition(def).some((e) => /no signatures/.test(e))).toBe(true);
  });

  it('flags an invalid (NaN) confidence', () => {
    const def = {
      ...baseDef,
      headerSignatures: [
        {
          headerName: 'server',
          matchValue: 'x',
          technologyId: 'test-tech',
          confidence: Number.NaN,
        },
      ],
    } as unknown as TechnologyDefinition;
    expect(validateDefinition(def).some((e) => /invalid confidence/.test(e))).toBe(true);
  });

  it('flags an out-of-range (>100) confidence', () => {
    const def = {
      ...baseDef,
      headerSignatures: [
        { headerName: 'server', matchValue: 'x', technologyId: 'test-tech', confidence: 101 },
      ],
    } as unknown as TechnologyDefinition;
    expect(validateDefinition(def).some((e) => /invalid confidence 101/.test(e))).toBe(true);
  });

  it('flags a version rule whose pattern is not a RegExp', () => {
    const def = {
      ...baseDef,
      headerSignatures: [
        {
          headerName: 'server',
          matchValue: 'x',
          technologyId: 'test-tech',
          confidence: 90,
          version: { source: 'matchedValue', rule: { pattern: 'not-a-regex' } },
        },
      ],
    } as unknown as TechnologyDefinition;
    expect(
      validateDefinition(def).some((e) => /version rule without a RegExp pattern/.test(e)),
    ).toBe(true);
  });

  it('flags a version rule with an invalid captureGroup', () => {
    const def = {
      ...baseDef,
      headerSignatures: [
        {
          headerName: 'server',
          matchValue: 'x',
          technologyId: 'test-tech',
          confidence: 90,
          version: { source: 'matchedValue', rule: { pattern: /x/, captureGroup: -1 } },
        },
      ],
    } as unknown as TechnologyDefinition;
    expect(validateDefinition(def).some((e) => /invalid captureGroup/.test(e))).toBe(true);
  });

  it('flags a version extraction with an invalid source', () => {
    const def = {
      ...baseDef,
      headerSignatures: [
        {
          headerName: 'server',
          matchValue: 'x',
          technologyId: 'test-tech',
          confidence: 90,
          version: { source: 'bogus' as unknown as 'matchedValue', rule: { pattern: /x/ } },
        },
      ],
    } as unknown as TechnologyDefinition;
    expect(validateDefinition(def).some((e) => /invalid source/.test(e))).toBe(true);
  });
});

describe('validateDefinitions — cross-definition integrity', () => {
  it('rejects duplicate ids across definitions', () => {
    const defs = [
      { id: 'dup', name: 'A', category: 'server', headerSignatures: [] },
      { id: 'dup', name: 'B', category: 'server', headerSignatures: [] },
    ] as unknown as TechnologyDefinition[];
    expect(validateDefinitions(defs).some((e) => /Duplicate technology id/.test(e))).toBe(true);
  });

  it('accepts a valid pair of definitions', () => {
    const defs = [
      baseDef,
      {
        ...baseDef,
        id: 'other-tech',
        headerSignatures: [
          { headerName: 'server', matchValue: 'y', technologyId: 'other-tech', confidence: 80 },
        ],
      },
    ] as unknown as TechnologyDefinition[];
    expect(validateDefinitions(defs)).toEqual([]);
  });

  it('the real catalog re-validates through validateDefinitions', () => {
    expect(validateDefinitions(TECHNOLOGY_DEFINITIONS)).toEqual([]);
  });
});
