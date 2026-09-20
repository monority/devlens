/** BigCommerce — e-commerce platform (bcapp.com script URL). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const bigcommerce: TechnologyDefinition = {
  id: 'bigcommerce',
  name: 'BigCommerce',
  category: 'ecommerce',
  scriptUrlSignatures: [{ matchUrl: 'bcapp.com', technologyId: 'bigcommerce', confidence: 90 }],
};
