/**
 * Unit tests for the clipboard helper.
 *
 * Tests the `copyToClipboard` utility by mocking the global
 * `navigator.clipboard` API.
 */

import { describe, it, expect, vi } from 'vitest';
import { copyToClipboard } from './clipboard.js';

describe('copyToClipboard', () => {
  it('returns true on successful clipboard write', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });

    const result = await copyToClipboard('https://example.com/scans/abc123');
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://example.com/scans/abc123');

    vi.unstubAllGlobals();
  });

  it('returns false when clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: undefined,
    });

    const result = await copyToClipboard('test');
    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });

  it('returns false when writeText throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Not allowed'));
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });

    const result = await copyToClipboard('test');
    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });
});
