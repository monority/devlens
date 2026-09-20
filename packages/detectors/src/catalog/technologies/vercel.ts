/**
 * Vercel — edge platform (Server header fingerprint).
 *
 * PHASE 12 PROOF: added using ONLY a declarative catalog definition + a
 * fixture (see `detector-fixtures.ts`). No detector, scorer, deduplicator,
 * or `production-detector.ts` source was modified to add this technology —
 * it is picked up by the existing `HeaderDetector`, which now reads its
 * signatures from the catalog.
 */
import type { TechnologyDefinition } from '../types.js';

export const vercel: TechnologyDefinition = {
  id: 'vercel',
  name: 'Vercel',
  category: 'cdn',
  headerSignatures: [
    {
      headerName: 'server',
      matchValue: 'vercel',
      technologyId: 'vercel',
      confidence: 90,
    },
  ],
};
