/** Firebase — service worker platform (manifest gcm_sender_id fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const firebase: TechnologyDefinition = {
  id: 'firebase',
  name: 'Firebase',
  category: 'service_worker',
  resourceSignatures: [
    {
      matchType: 'manifest',
      matchContent: 'gcm_sender_id',
      technologyId: 'firebase',
      confidence: 95,
    },
  ],
};
