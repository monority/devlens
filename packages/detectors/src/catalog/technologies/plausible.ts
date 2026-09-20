/** Plausible Analytics — privacy analytics (plausible.io script URL). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const plausible: TechnologyDefinition = {
  id: 'plausible',
  name: 'Plausible Analytics',
  category: 'analytics',
  scriptUrlSignatures: [{ matchUrl: 'plausible.io', technologyId: 'plausible', confidence: 90 }],
};
