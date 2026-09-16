import { describe, it, expect } from 'vitest';
import { createDetection } from './detection';
import { createConfidence, createUrl, createTechnologyId } from './value-objects';
import { createTechnologyCategory } from './technology';
import type { Evidence } from './evidence';
import type { Technology } from './technology';

function makeTech(): Technology {
  return {
    id: createTechnologyId('react'),
    name: 'React',
    category: createTechnologyCategory('frontend'),
  };
}

describe('createDetection', () => {
  it('creates a valid detection', () => {
    const evidence: Evidence[] = [
      { type: 'html', selector: 'script[src*="react"]', snippet: '<script src="react.js">' },
    ];
    const detection = createDetection(makeTech(), createConfidence(90), evidence);
    expect(detection.technology).toEqual(makeTech());
    expect(detection.confidence).toBe(90);
    expect(detection.evidence).toHaveLength(1);
  });

  it('throws when evidence is empty', () => {
    expect(() => createDetection(makeTech(), createConfidence(50), [])).toThrow(
      'at least one evidence',
    );
  });

  it('copies the evidence array (defensive)', () => {
    const evidence: Evidence[] = [{ type: 'http_header', name: 'X-Powered-By', value: 'Express' }];
    const detection = createDetection(makeTech(), createConfidence(75), evidence);
    evidence.push({ type: 'meta_tag', name: 'generator', content: 'Next.js' });
    expect(detection.evidence).toHaveLength(1);
  });

  it('preserves multiple evidence items', () => {
    const evidence: Evidence[] = [
      { type: 'html', selector: 'div#react', snippet: '<div id="react">' },
      { type: 'script_url', url: createUrl('https://cdn.example.com/react.js') },
      { type: 'javascript_global', globalName: '__REACT_DEVTOOLS__' },
    ];
    const detection = createDetection(makeTech(), createConfidence(85), evidence);
    expect(detection.evidence).toHaveLength(3);
  });
});
