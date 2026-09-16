import { describe, it, expect } from 'vitest';
import {
  createUrl,
  createHostname,
  createScanId,
  createTechnologyId,
  createTimestamp,
  createTimestampFromString,
  createConfidence,
  createHttpStatus,
} from './value-objects';

describe('URL and Hostname', () => {
  it('creates a Url from a non-empty string', () => {
    const url = createUrl('https://example.com/page');
    expect(url).toBe('https://example.com/page');
  });

  it('throws on empty Url', () => {
    expect(() => createUrl('')).toThrow('Url must not be empty');
  });

  it('throws on whitespace-only Url', () => {
    expect(() => createUrl('   ')).toThrow('Url must not be empty');
  });

  it('creates a Hostname from a non-empty string', () => {
    const hostname = createHostname('example.com');
    expect(hostname).toBe('example.com');
  });

  it('throws on empty Hostname', () => {
    expect(() => createHostname('')).toThrow('Hostname must not be empty');
  });
});

describe('ScanId and TechnologyId', () => {
  it('creates a ScanId from a non-empty string', () => {
    const id = createScanId('scan_abc123');
    expect(id).toBe('scan_abc123');
  });

  it('throws on empty ScanId', () => {
    expect(() => createScanId('')).toThrow('ScanId must not be empty');
  });

  it('throws on whitespace-only ScanId', () => {
    expect(() => createScanId(' ')).toThrow('ScanId must not be empty');
  });

  it('creates a TechnologyId from a non-empty string', () => {
    const id = createTechnologyId('react');
    expect(id).toBe('react');
  });

  it('throws on empty TechnologyId', () => {
    expect(() => createTechnologyId('')).toThrow('TechnologyId must not be empty');
  });
});

describe('Timestamp', () => {
  it('creates a Timestamp from a Date', () => {
    const date = new Date('2025-06-01T12:00:00.000Z');
    const ts = createTimestamp(date);
    expect(ts).toBe('2025-06-01T12:00:00.000Z');
  });

  it('creates a Timestamp from a valid ISO string', () => {
    const ts = createTimestampFromString('2025-06-01T12:00:00.000Z');
    expect(ts).toBe('2025-06-01T12:00:00.000Z');
  });

  it('throws on empty ISO string', () => {
    expect(() => createTimestampFromString('')).toThrow('Timestamp must not be empty');
  });

  it('throws on invalid ISO string', () => {
    expect(() => createTimestampFromString('not-a-date')).toThrow('Invalid timestamp');
  });
});

describe('Confidence', () => {
  it('accepts 0', () => {
    expect(createConfidence(0)).toBe(0);
  });

  it('accepts 50', () => {
    expect(createConfidence(50)).toBe(50);
  });

  it('accepts 100', () => {
    expect(createConfidence(100)).toBe(100);
  });

  it('accepts fractional values within range', () => {
    expect(createConfidence(33.3)).toBeCloseTo(33.3);
  });

  it('throws on negative values', () => {
    expect(() => createConfidence(-1)).toThrow('Confidence must be between 0 and 100');
  });

  it('throws on values above 100', () => {
    expect(() => createConfidence(101)).toThrow('Confidence must be between 0 and 100');
  });

  it('throws on NaN', () => {
    expect(() => createConfidence(NaN)).toThrow('Confidence must be a finite number');
  });

  it('throws on Infinity', () => {
    expect(() => createConfidence(Infinity)).toThrow('Confidence must be a finite number');
  });
});

describe('HttpStatus', () => {
  it('accepts 100', () => {
    expect(createHttpStatus(100)).toBe(100);
  });

  it('accepts 200', () => {
    expect(createHttpStatus(200)).toBe(200);
  });

  it('accepts 404', () => {
    expect(createHttpStatus(404)).toBe(404);
  });

  it('accepts 599', () => {
    expect(createHttpStatus(599)).toBe(599);
  });

  it('throws on values below 100', () => {
    expect(() => createHttpStatus(99)).toThrow('HTTP status code must be between 100 and 599');
  });

  it('throws on values above 599', () => {
    expect(() => createHttpStatus(600)).toThrow('HTTP status code must be between 100 and 599');
  });

  it('throws on non-integer values', () => {
    expect(() => createHttpStatus(200.5)).toThrow('HTTP status code must be an integer');
  });
});
