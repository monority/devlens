/** Fastly — CDN / edge (Via header fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const fastly: TechnologyDefinition = {
  id: 'fastly',
  name: 'Fastly',
  category: 'cdn',
  headerSignatures: [
    {
      headerName: 'via',
      matchValue: 'fastly',
      technologyId: 'fastly',
      confidence: 90,
    },
  ],
};
