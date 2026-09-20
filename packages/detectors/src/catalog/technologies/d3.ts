/** D3 — data visualization (d3.v script URL, version captured). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const d3: TechnologyDefinition = {
  id: 'd3',
  name: 'D3',
  category: 'library',
  scriptUrlSignatures: [
    {
      matchUrl: 'd3.v',
      technologyId: 'd3',
      confidence: 90,
      version: {
        source: 'matchedValue',
        rule: { pattern: /d3\.v(\d+(?:\.\d+){0,2})/i },
      },
    },
  ],
};
