/** Hugo — static site generator (meta generator fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const hugo: TechnologyDefinition = {
  id: 'hugo',
  name: 'Hugo',
  category: 'cms',
  metaSignatures: [
    { tagName: 'generator', matchContent: 'hugo', technologyId: 'hugo', confidence: 85 },
  ],
};
