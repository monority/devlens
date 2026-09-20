/** LiteSpeed — web server (Server header fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const litespeed: TechnologyDefinition = {
  id: 'litespeed',
  name: 'LiteSpeed',
  category: 'server',
  headerSignatures: [
    {
      headerName: 'server',
      matchValue: 'litespeed',
      technologyId: 'litespeed',
      confidence: 95,
    },
  ],
};
