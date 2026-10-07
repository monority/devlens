/** Tailwind CSS — utility CSS framework (v4 @import "tailwindcss" + v3 @tailwind directive). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const tailwind: TechnologyDefinition = {
  id: 'tailwind',
  name: 'Tailwind CSS',
  category: 'library',
  // v4 uses @import "tailwindcss" (higher confidence — v4 is the current default).
  // v3 uses @tailwind base/components/utilities (lower confidence — legacy).
  resourceSignatures: [
    {
      matchType: 'css',
      matchContent: '@import "tailwindcss"',
      technologyId: 'tailwind',
      confidence: 90,
    },
    {
      matchType: 'css',
      matchContent: "@import 'tailwindcss'",
      technologyId: 'tailwind',
      confidence: 90,
    },
    { matchType: 'css', matchContent: '@tailwind', technologyId: 'tailwind', confidence: 85 },
  ],
};
