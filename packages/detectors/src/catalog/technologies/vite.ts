/** Vite — build tool (import.meta.env, __vite__ marker, /assets/ script paths). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const vite: TechnologyDefinition = {
  id: 'vite',
  name: 'Vite',
  category: 'build_tool',
  // `import.meta.env` is the Vite dev-server runtime global.
  // `__vite` is injected by Vite's HMR client.
  contentSignatures: [
    { matchContent: 'import.meta.env.DEV', technologyId: 'vite', confidence: 90 },
    { matchContent: 'import.meta.hot', technologyId: 'vite', confidence: 85 },
    { matchContent: '__vite', technologyId: 'vite', confidence: 80 },
  ],
  // /assets/ is Vite's dev-server asset path pattern.
  scriptUrlSignatures: [
    { matchUrl: 'vite/assets/', technologyId: 'vite', confidence: 90 },
    { matchUrl: '/@vite/', technologyId: 'vite', confidence: 85 },
  ],
  // Vite's compiled CSS uses these directives.
  resourceSignatures: [
    {
      matchType: 'css',
      matchContent: '/* vite-',
      technologyId: 'vite',
      confidence: 75,
    },
  ],
};
