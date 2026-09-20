/** Segment — analytics/telemetry (cdn.segment.com script URL). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const segment: TechnologyDefinition = {
  id: 'segment',
  name: 'Segment',
  category: 'analytics',
  scriptUrlSignatures: [{ matchUrl: 'cdn.segment.com', technologyId: 'segment', confidence: 90 }],
};
