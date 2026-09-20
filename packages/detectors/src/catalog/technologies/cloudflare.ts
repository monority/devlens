/** Cloudflare — CDN / edge (Server header fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const cloudflare: TechnologyDefinition = {
  id: 'cloudflare',
  name: 'Cloudflare',
  category: 'cdn',
  headerSignatures: [
    {
      headerName: 'server',
      matchValue: 'cloudflare',
      technologyId: 'cloudflare',
      confidence: 95,
    },
  ],
};
