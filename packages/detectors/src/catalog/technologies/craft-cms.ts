/** Craft CMS — CMS (meta generator, version captured). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const craftCms: TechnologyDefinition = {
  id: 'craft-cms',
  name: 'Craft CMS',
  category: 'cms',
  metaSignatures: [
    {
      tagName: 'generator',
      matchContent: 'craft cms',
      technologyId: 'craft-cms',
      confidence: 90,
      version: {
        source: 'matchedValue',
        rule: { pattern: /craft\s+cms\s+(\d+(?:\.\d+){0,2})/i },
      },
    },
  ],
};
