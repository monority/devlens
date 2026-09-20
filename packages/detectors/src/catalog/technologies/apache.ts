/** Apache HTTPD — web server (Server header fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const apache: TechnologyDefinition = {
  id: 'apache',
  name: 'Apache',
  category: 'server',
  headerSignatures: [
    {
      headerName: 'server',
      matchValue: 'apache',
      technologyId: 'apache',
      confidence: 95,
      version: {
        source: 'matchedValue',
        rule: { pattern: /apache\/(\d+(?:\.\d+){0,2})/i },
      },
    },
  ],
};
