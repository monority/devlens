/** Google Tag Manager — tag manager (googletagmanager.com script URL). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const googleTagManager: TechnologyDefinition = {
  id: 'google-tag-manager',
  name: 'Google Tag Manager',
  category: 'analytics',
  scriptUrlSignatures: [
    { matchUrl: 'googletagmanager.com', technologyId: 'google-tag-manager', confidence: 90 },
  ],
};
