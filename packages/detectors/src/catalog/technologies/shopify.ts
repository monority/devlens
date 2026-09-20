/** Shopify — e-commerce platform (exact hostname link signatures). Step 68 declarative catalog. */
import type { TechnologyDefinition } from '../types.js';

export const shopify: TechnologyDefinition = {
  id: 'shopify',
  name: 'Shopify',
  category: 'ecommerce',
  // cdn.shopify.com before shopifycdn.com (first-match evidence preference)
  linkSignatures: [
    {
      matchKind: 'hostname',
      matchValue: 'cdn.shopify.com',
      technologyId: 'shopify',
      confidence: 95,
    },
    {
      matchKind: 'hostname',
      matchValue: 'shopifycdn.com',
      technologyId: 'shopify',
      confidence: 95,
    },
  ],
};
