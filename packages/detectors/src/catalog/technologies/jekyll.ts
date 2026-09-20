/** Jekyll — static site generator (meta generator fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const jekyll: TechnologyDefinition = {
  id: 'jekyll',
  name: 'Jekyll',
  category: 'cms',
  metaSignatures: [
    { tagName: 'generator', matchContent: 'jekyll', technologyId: 'jekyll', confidence: 85 },
  ],
};
