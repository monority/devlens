/** Astro — framework (inline astro-island fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const astro: TechnologyDefinition = {
  id: 'astro',
  name: 'Astro',
  category: 'framework',
  contentSignatures: [{ matchContent: 'astro-island', technologyId: 'astro', confidence: 95 }],
  // Step 71 — fetched Astro client/hydration JS bundles. `__astro` is Astro's
  // runtime global namespace (a property access preserved by default
  // minification); `astro-island` is the custom-element name registered in
  // Astro's island-runtime bundle (a string literal). Both are Astro-specific
  // and minification-robust.
  resourceContentSignatures: [
    { matchType: 'script', matchContent: '__astro', technologyId: 'astro', confidence: 92 },
    { matchType: 'script', matchContent: 'astro-island', technologyId: 'astro', confidence: 85 },
  ],
};
