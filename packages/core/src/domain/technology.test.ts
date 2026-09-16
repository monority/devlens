import { describe, it, expect } from 'vitest';
import type { Technology } from './technology';
import { createTechnologyId } from './value-objects';
import { createTechnologyCategory } from './technology';

describe('Technology', () => {
  it('creates a technology with all fields', () => {
    const tech: Technology = {
      id: createTechnologyId('react'),
      name: 'React',
      category: createTechnologyCategory('frontend'),
    };
    expect(tech.id).toBe('react');
    expect(tech.name).toBe('React');
    expect(tech.category).toBe('frontend');
  });

  it('TechnologyCategory accepts arbitrary non-empty strings', () => {
    const categories = [
      'frontend',
      'backend',
      'infrastructure',
      'cms',
      'analytics',
      'build-tool',
      'framework',
      'emerging-tech', // dynamically introduced category
    ];
    for (const cat of categories) {
      const tech: Technology = {
        id: createTechnologyId('test-id'),
        name: 'Test',
        category: createTechnologyCategory(cat),
      };
      expect(tech.category).toBe(cat);
    }
  });

  it('TechnologyCategory throws on empty string', () => {
    expect(() => createTechnologyCategory('')).toThrow('TechnologyCategory must not be empty');
  });

  it('TechnologyCategory throws on whitespace-only string', () => {
    expect(() => createTechnologyCategory('   ')).toThrow('TechnologyCategory must not be empty');
  });
});
