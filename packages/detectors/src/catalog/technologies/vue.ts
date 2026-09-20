/** Vue.js — framework (inline Vue.createApp fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const vue: TechnologyDefinition = {
  id: 'vue',
  name: 'Vue.js',
  category: 'framework',
  contentSignatures: [{ matchContent: 'Vue.createApp', technologyId: 'vue', confidence: 95 }],
  // Step 71 — fetched Vue 3 ESM bundles. `@vue/runtime-dom` is the import
  // specifier baked into SFC-compiled output / the Vue 3 runtime bundle
  // (a string literal that survives minification). Catches Vue 3 module
  // builds that do not expose an inline `Vue.createApp` global.
  resourceContentSignatures: [
    { matchType: 'script', matchContent: '@vue/runtime-dom', technologyId: 'vue', confidence: 92 },
  ],
};
