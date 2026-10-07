/** SvelteKit — meta-framework for Svelte (SvelteKit route manifest + __SVELTE__ compile marker). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const sveltekit: TechnologyDefinition = {
  id: 'sveltekit',
  name: 'SvelteKit',
  category: 'framework',
  // __SVELTE__ is the strongest SvelteKit-specific fingerprint (compile marker).
  // Svelte 4's SvelteComponent fingerprint may also fire (covered by svelte.ts).
  // Next: SvelteKit's data-loading route manifest.
  contentSignatures: [
    { matchContent: 'import.meta.env.SSR', technologyId: 'sveltekit', confidence: 80 },
    { matchContent: '$lib/', technologyId: 'sveltekit', confidence: 75 },
    { matchContent: '__data.json', technologyId: 'sveltekit', confidence: 75 },
  ],
  // _app/immutable paths are SvelteKit's compiled asset directory.
  // @sveltejs/kit is the adapter import specifier.
  scriptUrlSignatures: [
    { matchUrl: '/_app/immutable/', technologyId: 'sveltekit', confidence: 90 },
  ],
  // SvelteKit is built on Svelte — observing SvelteKit implies Svelte.
  relationships: [{ type: 'implies', target: 'svelte' }],
};
