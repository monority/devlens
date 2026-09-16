/**
 * DevLens worker — thin runtime entry point.
 *
 * Delegates all scan execution to `@devlens/application` (`runScan`).
 * The worker owns no lifecycle logic, no orchestration, and no
 * persistence. See `main.ts` for the execution logic.
 */

import { main } from './main.js';

void main().catch((error: unknown) => {
  console.error('Worker encountered an unexpected error:', error);
  process.exitCode = 1;
});
