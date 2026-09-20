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
    {
      matchType: 'script',
      matchContent: '@angular/core',
      technologyId: 'angular',
      confidence: 95,
      // §15 — Step 71 fully exploited. The `@angular/core` bundle embeds its
      // `VERSION` constant as `{ full: "<semver>" }`; the `full:` key survives
      // minification as a property name and is only read from resources that
      // already matched the `@angular/core` fingerprint above (no generic
      // matching). This is the resource-content source for Angular versions.
      version: {
        source: 'matchedValue',
        // Angular's `@angular/core` bundle exposes `VERSION = { full: "16.2.0", ... }`
        // (the `full` property name survives minification). Optional whitespace
        // after the colon covers both minified (`full:"16.2.0"`) and pretty
        // (`full: "16.2.0"`) emissions.
        rule: { pattern: /full:\s*["'](\d+(?:\.\d+){0,2})["']/ },
      },
    },
    {
      matchType: 'script',
      matchContent: '__ng_context__',
      technologyId: 'angular',
      confidence: 90,
    },
  ],
};
