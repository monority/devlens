/** Nuxt.js — Vue framework (meta generator + /_nuxt/ script URL). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const nuxtjs: TechnologyDefinition = {
  id: 'nuxtjs',
  name: 'Nuxt.js',
  category: 'framework',
  metaSignatures: [
    { tagName: 'generator', matchContent: 'nuxt.js', technologyId: 'nuxtjs', confidence: 85 },
  ],
  scriptUrlSignatures: [{ matchUrl: '/_nuxt/', technologyId: 'nuxtjs', confidence: 90 }],
  // Step 69: Nuxt.js is built on Vue. Observing Nuxt.js *implies* Vue, so
  // Vue is derived when Nuxt.js is detected and Vue is not already directly
  // observed. When Vue IS directly observed (its runtime bundle is
  // present), no derivation occurs.
  relationships: [{ type: 'implies', target: 'vue' }],
};
