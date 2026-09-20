/** Matomo — analytics (matomo.js / legacy piwik.js script URL). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const matomo: TechnologyDefinition = {
  id: 'matomo',
  name: 'Matomo',
  category: 'analytics',
  // matomo.js before piwik.js (first-match evidence preference)
  scriptUrlSignatures: [
    { matchUrl: 'matomo.js', technologyId: 'matomo', confidence: 90 },
    { matchUrl: 'piwik.js', technologyId: 'matomo', confidence: 90 },
  ],
};
