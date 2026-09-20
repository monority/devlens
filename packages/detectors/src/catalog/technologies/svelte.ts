/** Svelte — framework (inline __SVELTE__ + SvelteComponent). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const svelte: TechnologyDefinition = {
  id: 'svelte',
  name: 'Svelte',
  category: 'framework',
  // __SVELTE__ (95) before SvelteComponent (90) — strongest evidence first
  contentSignatures: [
    { matchContent: '__SVELTE__', technologyId: 'svelte', confidence: 95 },
    { matchContent: 'SvelteComponent', technologyId: 'svelte', confidence: 90 },
  ],
  // Step 71 — fetched Svelte 4 compiled/runtime bundles. `svelte/internal`
  // is the runtime import specifier (string literal, survives minification)
  // emitted into every Svelte 4 component bundle.
  resourceContentSignatures: [
    {
      matchType: 'script',
      matchContent: 'svelte/internal',
      technologyId: 'svelte',
      confidence: 90,
    },
  ],
};
