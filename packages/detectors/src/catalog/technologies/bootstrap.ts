/** Bootstrap — CSS framework (bootstrap. script URL). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const bootstrap: TechnologyDefinition = {
  id: 'bootstrap',
  name: 'Bootstrap',
  category: 'framework',
  scriptUrlSignatures: [{ matchUrl: 'bootstrap.', technologyId: 'bootstrap', confidence: 80 }],
};
