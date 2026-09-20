/** Caddy — web server (Server header fingerprint, version captured). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const caddy: TechnologyDefinition = {
  id: 'caddy',
  name: 'Caddy',
  category: 'server',
  headerSignatures: [
    {
      headerName: 'server',
      matchValue: 'caddy',
      technologyId: 'caddy',
      confidence: 95,
      version: {
        source: 'matchedValue',
        rule: { pattern: /caddy\/v?(\d+(?:\.\d+){0,2})/i },
      },
    },
  ],
};
