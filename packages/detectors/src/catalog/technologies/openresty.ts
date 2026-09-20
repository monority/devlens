/** OpenResty — web platform (Server header fingerprint, version captured). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const openresty: TechnologyDefinition = {
  id: 'openresty',
  name: 'OpenResty',
  category: 'server',
  headerSignatures: [
    {
      headerName: 'server',
      matchValue: 'openresty',
      technologyId: 'openresty',
      confidence: 95,
      version: {
        source: 'matchedValue',
        rule: { pattern: /openresty\/(\d+(?:\.\d+){0,3})/i },
      },
    },
  ],
};
