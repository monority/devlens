import { describe, it, expect } from 'vitest';
import { version } from './index';

describe('core', () => {
  it('should export a version string', () => {
    expect(version).toBe('0.1.0');
  });
});
