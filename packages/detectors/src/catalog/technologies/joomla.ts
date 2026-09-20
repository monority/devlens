/** Joomla — CMS (meta generator, version captured). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const joomla: TechnologyDefinition = {
  id: 'joomla',
  name: 'Joomla',
  category: 'cms',
  metaSignatures: [
    {
      tagName: 'generator',
      matchContent: 'joomla',
      technologyId: 'joomla',
      confidence: 90,
      version: {
        source: 'matchedValue',
        rule: { pattern: /joomla!?\s+(\d+(?:\.\d+){0,2})/i },
      },
    },
  ],
};
