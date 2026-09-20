/** Express — web framework (X-Powered-By header fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const express: TechnologyDefinition = {
  id: 'express',
  name: 'Express',
  category: 'framework',
  headerSignatures: [
    {
      headerName: 'x-powered-by',
      matchValue: 'express',
      technologyId: 'express',
      confidence: 90,
    },
  ],
};
