/** Next.js — framework (meta generator + _next/ script URL + __NEXT_DATA__ inline). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const nextjs: TechnologyDefinition = {
  id: 'nextjs',
  name: 'Next.js',
  category: 'framework',
  metaSignatures: [
    { tagName: 'generator', matchContent: 'next.js', technologyId: 'nextjs', confidence: 85 },
  ],
  scriptUrlSignatures: [{ matchUrl: '/_next/', technologyId: 'nextjs', confidence: 90 }],
  // highest-confidence fingerprint first (evidence-preference order)
  contentSignatures: [
    { matchContent: '__NEXT_DATA__', technologyId: 'nextjs', confidence: 95 },
    { matchContent: 'next/router', technologyId: 'nextjs', confidence: 90 },
    { matchContent: 'next/navigation', technologyId: 'nextjs', confidence: 90 },
  ],
  // Step 69: Next.js is built on React. Observing Next.js *implies* React,
  // so React is derived (as a relationship-derived Detection) when Next.js
  // is detected and React is not already directly observed. When React IS
  // directly observed (e.g. its runtime bundle is present), no derivation
  // occurs — the `implies` is simply redundant.
  relationships: [{ type: 'implies', target: 'react' }],
};
