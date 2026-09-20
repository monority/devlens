/** WooCommerce — e-commerce plugin (woocommerce script URL). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const woocommerce: TechnologyDefinition = {
  id: 'woocommerce',
  name: 'WooCommerce',
  category: 'ecommerce',
  scriptUrlSignatures: [{ matchUrl: 'woocommerce', technologyId: 'woocommerce', confidence: 85 }],
  // Step 69: WooCommerce is a WordPress plugin — it REQUIRES WordPress to
  // run. This is a validation/missing-requirement constraint, NOT a
  // derivation: if WordPress is not directly observed, a `requires`
  // conflict is surfaced on the WooCommerce detection. WordPress is never
  // auto-derived from this edge.
  relationships: [{ type: 'requires', target: 'wordpress' }],
};
