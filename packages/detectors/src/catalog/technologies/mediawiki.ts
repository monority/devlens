/** MediaWiki — wiki engine (meta generator, version captured). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const mediawiki: TechnologyDefinition = {
  id: 'mediawiki',
  name: 'MediaWiki',
  category: 'cms',
  metaSignatures: [
    {
      tagName: 'generator',
      matchContent: 'mediawiki',
      technologyId: 'mediawiki',
      confidence: 90,
      version: {
        source: 'matchedValue',
        rule: { pattern: /mediawiki\s+(\d+(?:\.\d+){0,2})/i },
      },
    },
  ],
};
