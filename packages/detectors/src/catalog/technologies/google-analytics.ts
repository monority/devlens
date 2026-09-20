/** Google Analytics — analytics (google-analytics script URL). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const googleAnalytics: TechnologyDefinition = {
  id: 'google-analytics',
  name: 'Google Analytics',
  category: 'analytics',
  scriptUrlSignatures: [
    { matchUrl: 'google-analytics', technologyId: 'google-analytics', confidence: 85 },
  ],
};
