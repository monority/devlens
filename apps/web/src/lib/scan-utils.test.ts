/**
 * Unit tests for the scan lifecycle helper functions.
 */

import { describe, it, expect } from 'vitest';
import { isTerminal, isScanning, POLLING_INTERVAL_MS } from './scan-utils.js';

describe('isTerminal', () => {
  it('returns true for completed', () => {
    expect(isTerminal('completed')).toBe(true);
  });

  it('returns true for failed', () => {
    expect(isTerminal('failed')).toBe(true);
  });

  it('returns false for pending', () => {
    expect(isTerminal('pending')).toBe(false);
  });

  it('returns false for running', () => {
    expect(isTerminal('running')).toBe(false);
  });

  it('returns false for unknown status', () => {
    expect(isTerminal('unknown')).toBe(false);
  });
});

describe('isScanning', () => {
  it('returns true for pending', () => {
    expect(isScanning('pending')).toBe(true);
  });

  it('returns true for running', () => {
    expect(isScanning('running')).toBe(true);
  });

  it('returns false for completed', () => {
    expect(isScanning('completed')).toBe(false);
  });

  it('returns false for failed', () => {
    expect(isScanning('failed')).toBe(false);
  });

  it('returns false for unknown status', () => {
    expect(isScanning('unknown')).toBe(false);
  });
});

describe('POLLING_INTERVAL_MS', () => {
  it('is 2500 (2.5 seconds)', () => {
    expect(POLLING_INTERVAL_MS).toBe(2500);
  });
});
