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
};
