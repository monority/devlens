/** Gatsby — React framework (meta generator + gatsby script URL). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const gatsby: TechnologyDefinition = {
  id: 'gatsby',
  name: 'Gatsby',
  category: 'framework',
  metaSignatures: [
    { tagName: 'generator', matchContent: 'gatsby', technologyId: 'gatsby', confidence: 85 },
  ],
  scriptUrlSignatures: [{ matchUrl: 'gatsby', technologyId: 'gatsby', confidence: 85 }],
};
