/** WooCommerce — e-commerce plugin (woocommerce script URL). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const woocommerce: TechnologyDefinition = {
  id: 'woocommerce',
  name: 'WooCommerce',
  category: 'ecommerce',
  scriptUrlSignatures: [{ matchUrl: 'woocommerce', technologyId: 'woocommerce', confidence: 85 }],
};
