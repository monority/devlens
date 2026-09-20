/** Angular — framework (inline @angular/core + platformBrowserDynamic). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const angular: TechnologyDefinition = {
  id: 'angular',
  name: 'Angular',
  category: 'framework',
  contentSignatures: [
    { matchContent: '@angular/core', technologyId: 'angular', confidence: 95 },
    { matchContent: 'platformBrowserDynamic', technologyId: 'angular', confidence: 90 },
  ],
  // Step 71 — fetched JS bundles. `@angular/core` is the stable ESM import
  // specifier (a string literal preserved by minifiers) emitted into every
  // Angular app bundle; `__ng_context__` is Angular's renderer property
  // written to component host elements. Both are minification-robust and
  // Angular-specific (§7 — no generic tokens).
  resourceContentSignatures: [
    { matchType: 'script', matchContent: '@angular/core', technologyId: 'angular', confidence: 95 },
    {
      matchType: 'script',
      matchContent: '__ng_context__',
      technologyId: 'angular',
      confidence: 90,
    },
  ],
};
