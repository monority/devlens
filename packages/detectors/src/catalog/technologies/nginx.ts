/** nginx — web server (Server header fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const nginx: TechnologyDefinition = {
  id: 'nginx',
  name: 'nginx',
  category: 'server',
  headerSignatures: [
    {
      headerName: 'server',
      matchValue: 'nginx',
      technologyId: 'nginx',
      confidence: 95,
      version: {
        source: 'matchedValue',
        rule: { pattern: /nginx\/(\d+(?:\.\d+){0,2})/ },
      },
    },
  ],
};
