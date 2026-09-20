/** Vue.js — framework (inline Vue.createApp fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const vue: TechnologyDefinition = {
  id: 'vue',
  name: 'Vue.js',
  category: 'framework',
  contentSignatures: [{ matchContent: 'Vue.createApp', technologyId: 'vue', confidence: 95 }],
};
