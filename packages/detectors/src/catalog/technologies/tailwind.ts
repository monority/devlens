/** Tailwind CSS — utility CSS framework (CSS body @tailwind fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const tailwind: TechnologyDefinition = {
  id: 'tailwind',
  name: 'Tailwind CSS',
  category: 'library',
  resourceSignatures: [
    { matchType: 'css', matchContent: '@tailwind', technologyId: 'tailwind', confidence: 85 },
  ],
};
