/** Ghost — publishing platform (meta generator fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const ghost: TechnologyDefinition = {
  id: 'ghost',
  name: 'Ghost',
  category: 'cms',
  metaSignatures: [
    { tagName: 'generator', matchContent: 'ghost', technologyId: 'ghost', confidence: 85 },
  ],
};
