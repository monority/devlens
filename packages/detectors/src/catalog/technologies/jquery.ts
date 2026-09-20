/** jQuery — library (jquery script URL, version captured). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const jquery: TechnologyDefinition = {
  id: 'jquery',
  name: 'jQuery',
  category: 'library',
  scriptUrlSignatures: [
    {
      matchUrl: 'jquery',
      technologyId: 'jquery',
      confidence: 85,
      version: {
        source: 'matchedValue',
        rule: { pattern: /jquery-(\d+(?:\.\d+){0,2})/i },
      },
    },
  ],
};
