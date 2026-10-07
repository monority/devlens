/** Bun — JavaScript runtime (Bun-specific Server header + bun: protocol specifiers). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const bun: TechnologyDefinition = {
  id: 'bun',
  name: 'Bun',
  category: 'runtime',
  // `bun` as a Server header value is the strongest fingerprint.
  // `Bun.` is the runtime global object referenced in code.
  headerSignatures: [
    {
      headerName: 'server',
      matchValue: 'bun',
      technologyId: 'bun',
      confidence: 95,
    },
  ],
  contentSignatures: [
    { matchContent: 'Bun.serve', technologyId: 'bun', confidence: 90 },
    { matchContent: 'Bun.file', technologyId: 'bun', confidence: 85 },
    { matchContent: 'bun:sqlite', technologyId: 'bun', confidence: 85 },
    { matchContent: 'bun:ffi', technologyId: 'bun', confidence: 80 },
  ],
  // SvelteKit can be deployed on Bun via the Bun adapter; this is a weak signal.
  resourceContentSignatures: [
    {
      matchType: 'script',
      matchContent: 'bun:sqlite',
      technologyId: 'bun',
      confidence: 80,
    },
  ],
};
