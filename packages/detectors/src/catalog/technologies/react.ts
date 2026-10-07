/** React — library/framework (inline react-dom + ReactDOM + RSC directives). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const react: TechnologyDefinition = {
  id: 'react',
  name: 'React',
  category: 'framework',
  // react-dom before ReactDOM (highest-confidence first; both 90 here)
  contentSignatures: [
    { matchContent: 'react-dom', technologyId: 'react', confidence: 90 },
    { matchContent: 'ReactDOM', technologyId: 'react', confidence: 90 },
    // React Server Components: 'use client' directive marks client-boundary
    // components in App Router / RSC setups. 'use server' marks server actions.
    { matchContent: "'use client'", technologyId: 'react', confidence: 85 },
    { matchContent: '"use client"', technologyId: 'react', confidence: 85 },
    { matchContent: "'use server'", technologyId: 'react', confidence: 80 },
    { matchContent: '"use server"', technologyId: 'react', confidence: 80 },
    // Webpack RSC compilation marker (dev-mode SSR bundle).
    { matchContent: 'ReactServerComponents', technologyId: 'react', confidence: 85 },
    // RSC stream hydration entry.
    { matchContent: 'createFromReadableStream', technologyId: 'react', confidence: 85 },
  ],
};
