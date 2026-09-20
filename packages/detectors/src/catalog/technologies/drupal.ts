/** Drupal — CMS (inline window.drupalSettings content fingerprint). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const drupal: TechnologyDefinition = {
  id: 'drupal',
  name: 'Drupal',
  category: 'cms',
  contentSignatures: [{ matchContent: 'drupalSettings', technologyId: 'drupal', confidence: 90 }],
};
