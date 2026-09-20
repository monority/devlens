/** Apache Tomcat — servlet container (Server header Apache-Coyote, version captured). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const tomcat: TechnologyDefinition = {
  id: 'tomcat',
  name: 'Tomcat',
  category: 'server',
  headerSignatures: [
    {
      headerName: 'server',
      matchValue: 'apache-coyote',
      technologyId: 'tomcat',
      confidence: 90,
      version: {
        source: 'matchedValue',
        rule: { pattern: /apache-coyote\/(\d+(?:\.\d+){0,2})/i },
      },
    },
  ],
};
