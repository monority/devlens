/** Astro — framework (inline astro-island fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const astro: TechnologyDefinition = {
  id: 'astro',
  name: 'Astro',
  category: 'framework',
  contentSignatures: [{ matchContent: 'astro-island', technologyId: 'astro', confidence: 95 }],
};
