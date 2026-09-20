/** Google Fonts — font delivery (exact hostname link signature). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const googleFonts: TechnologyDefinition = {
  id: 'google-fonts',
  name: 'Google Fonts',
  category: 'fonts',
  linkSignatures: [
    {
      matchKind: 'hostname',
      matchValue: 'fonts.googleapis.com',
      technologyId: 'google-fonts',
      confidence: 90,
    },
  ],
};
