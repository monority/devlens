/** IIS — Microsoft web server (Server header fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const iis: TechnologyDefinition = {
  id: 'iis',
  name: 'IIS',
  category: 'server',
  headerSignatures: [
    {
      headerName: 'server',
      matchValue: 'microsoft-iis',
      technologyId: 'iis',
      confidence: 95,
      version: {
        source: 'matchedValue',
        rule: { pattern: /microsoft-iis\/(\d+(?:\.\d+){0,2})/i },
      },
    },
  ],
};
