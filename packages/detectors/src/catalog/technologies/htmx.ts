/** HTMX — hypermedia library (htmx.org script URL). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const htmx: TechnologyDefinition = {
  id: 'htmx',
  name: 'HTMX',
  category: 'library',
  scriptUrlSignatures: [{ matchUrl: 'htmx.org', technologyId: 'htmx', confidence: 95 }],
};
