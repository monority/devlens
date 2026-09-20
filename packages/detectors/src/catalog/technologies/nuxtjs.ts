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
};
