/**
 * Unit tests for the client-side URL validation helper.
 *
 * These tests verify the pure `validateUrl` function, which provides
 * immediate feedback for obviously invalid input. The server remains
 * authoritative — these checks do not replicate complex domain validation.
 */

import { describe, it, expect } from 'vitest';
import { validateUrl } from './validation.js';

describe('validateUrl', () => {
  it('returns null for a valid https URL', () => {
    expect(validateUrl('https://example.com')).toBeNull();
  });

  it('returns null for a valid http URL', () => {
    expect(validateUrl('http://example.com')).toBeNull();
  });

  it('returns null for a URL with path and query string', () => {
    expect(validateUrl('https://example.com/path?query=1')).toBeNull();
  });

  it('returns an error for an empty string', () => {
    expect(validateUrl('')).toBe('Please enter a URL.');
  });

  it('returns an error for a whitespace-only string', () => {
    expect(validateUrl('   ')).toBe('Please enter a URL.');
  });

  it('returns an error for a malformed URL', () => {
    expect(validateUrl('not a url')).toBe('Please enter a valid URL (e.g. https://example.com).');
  });

  it('returns an error for a URL without protocol', () => {
    expect(validateUrl('example.com')).toBe('Please enter a valid URL (e.g. https://example.com).');
  });

  it('returns an error for ftp protocol', () => {
    expect(validateUrl('ftp://example.com/file')).toBe('URL must use the http or https protocol.');
  });

  it('returns an error for javascript protocol', () => {
    expect(validateUrl('javascript:alert(1)')).toBe('URL must use the http or https protocol.');
  });

  it('returns an error for file protocol', () => {
    expect(validateUrl('file:///etc/passwd')).toBe('URL must use the http or https protocol.');
  });
});
