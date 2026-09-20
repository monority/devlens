/** Lodash — library (lodash script URL, version captured). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const lodash: TechnologyDefinition = {
  id: 'lodash',
  name: 'Lodash',
  category: 'library',
  scriptUrlSignatures: [
    {
      matchUrl: 'lodash',
      technologyId: 'lodash',
      confidence: 80,
      version: {
        source: 'matchedValue',
        rule: { pattern: /lodash[-@/](\d+(?:\.\d+){0,2})/ },
      },
    },
  ],
};
