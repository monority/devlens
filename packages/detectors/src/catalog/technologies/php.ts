/** PHP — server-side language (X-Powered-By header fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const php: TechnologyDefinition = {
  id: 'php',
  name: 'PHP',
  category: 'language',
  headerSignatures: [
    {
      headerName: 'x-powered-by',
      matchValue: 'php',
      technologyId: 'php',
      confidence: 90,
      version: {
        source: 'matchedValue',
        rule: { pattern: /php\/(\d+(?:\.\d+){0,2})/i },
      },
    },
  ],
};
