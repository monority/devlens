/**
 * Unit tests for the technology catalog presentation layer.
 *
 * Tests the pure catalog functions: `getTechnologies`, `getTechnologyById`,
 * `getTechnologyDescription`, and `isKnownTechnology`.
 *
 * These tests verify that the presentation layer faithfully wraps the
 * existing `@devlens/detectors` catalog without duplication or mutation.
 */

import { describe, it, expect } from 'vitest';
import {
  getTechnologies,
  getTechnologyById,
  getTechnologyDescription,
  isKnownTechnology,
} from './technology-catalog.js';
import { TECHNOLOGY_CATALOG, TECHNOLOGY_IDS } from '@devlens/detectors';

// ─── Tests ───────────────────────────────────────────────────────────

describe('technology-catalog', () => {
  describe('getTechnologies', () => {
    it('returns all catalog technologies', () => {
      const techs = getTechnologies();
      expect(techs).toHaveLength(Object.keys(TECHNOLOGY_CATALOG).length);
    });

    it('returns entries with id, name, category, and description', () => {
      const techs = getTechnologies();
      for (const tech of techs) {
        expect(tech.id).toEqual(expect.any(String));
        expect(tech.name).toEqual(expect.any(String));
        expect(tech.category).toEqual(expect.any(String));
        expect(tech.description).toEqual(expect.any(String));
        expect(tech.description.length).toBeGreaterThan(0);
      }
    });

    it('produces deterministic output (same order every call)', () => {
      const first = getTechnologies();
      const second = getTechnologies();
      const firstIds = first.map((t) => t.id);
      const secondIds = second.map((t) => t.id);
      expect(firstIds).toEqual(secondIds);
    });

    it('returns IDs that match the catalog keys', () => {
      const techs = getTechnologies();
      const catalogKeys = Object.keys(TECHNOLOGY_CATALOG);
      const techIds = techs.map((t) => t.id);
      expect(techIds.sort()).toEqual(catalogKeys.sort());
    });

    it('returns unique IDs', () => {
      const techs = getTechnologies();
      const ids = techs.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('getTechnologyById', () => {
    it('finds a valid technology ID', () => {
      const tech = getTechnologyById('react');
      expect(tech).not.toBeNull();
      expect(tech!.name).toBe('React');
      expect(tech!.category).toBe('framework');
      expect(tech!.description).toEqual(expect.any(String));
    });

    it('returns null for an unknown ID', () => {
      const tech = getTechnologyById('nonexistent-tech');
      expect(tech).toBeNull();
    });

    it('returns null for an empty string ID', () => {
      const tech = getTechnologyById('');
      expect(tech).toBeNull();
    });
  });

  describe('isKnownTechnology', () => {
    it('returns true for a known technology ID', () => {
      expect(isKnownTechnology('react')).toBe(true);
      expect(isKnownTechnology('nginx')).toBe(true);
      expect(isKnownTechnology('google-analytics')).toBe(true);
    });

    it('returns false for an unknown technology ID', () => {
      expect(isKnownTechnology('nonexistent')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(isKnownTechnology('')).toBe(false);
    });

    it('is consistent with TECHNOLOGY_IDS from the source catalog', () => {
      // isKnownTechnology should agree with the source set
      expect(isKnownTechnology('react')).toBe(TECHNOLOGY_IDS.has('react'));
      expect(isKnownTechnology('unknown')).toBe(TECHNOLOGY_IDS.has('unknown'));
    });
  });

  describe('getTechnologyDescription', () => {
    it('returns a description for a known technology', () => {
      const desc = getTechnologyDescription('react');
      expect(desc.length).toBeGreaterThan(0);
    });

    it('returns a fallback for an unknown technology', () => {
      const desc = getTechnologyDescription('unknown-tech');
      expect(desc).toBe('Detected by DevLens.');
    });
  });

  describe('caller immutability', () => {
    it('caller mutation cannot corrupt the source catalog', () => {
      const techs = getTechnologies();
      // Cast away readonly for testing (runtime allows it)
      const mutableTech = techs[0] as { name: string; description: string };
      const originalName = techs[0]!.name;
      mutableTech.name = 'MUTATED';
      mutableTech.description = 'corrupted';

      // Re-fetch — source catalog should be unaffected
      const fresh = getTechnologyById(techs[0]!.id);
      expect(fresh!.name).toBe(originalName);
      expect(fresh!.name).not.toBe('MUTATED');
      expect(fresh!.description).not.toBe('corrupted');
    });
  });

  describe('descriptions are present for every exposed technology', () => {
    it('every catalog technology has a description', () => {
      const techs = getTechnologies();
      for (const tech of techs) {
        expect(tech.description.length).toBeGreaterThan(0);
      }
    });
  });
});
