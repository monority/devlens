/**
 * Technology — a technology that DevLens can detect on a website.
 *
 * Concrete technology definitions and their detectors belong to a later
 * step (the detectors layer). The domain model only represents the
 * concept generically: an id, a display name, and a category.
 */

import type { TechnologyId } from './value-objects.js';

/**
 * A technology category.
 *
 * Decision: branded string, NOT a closed union.
 *
 * TechnologyCategory is a product/catalog classification — the set of
 * valid categories is determined by the product (which technologies
 * are tracked and how they are grouped), not by a domain invariant.
 * New categories may be introduced dynamically as detector definitions
 * are added. A branded string preserves type safety (preventing
 * accidental mixing with other string concepts) while remaining
 * extensible.
 */
export type TechnologyCategory = string & { readonly _brand: 'TechnologyCategory' };

/**
 * Creates a {@link TechnologyCategory} from a raw string.
 * @throws {Error} if the category is empty.
 */
export function createTechnologyCategory(category: string): TechnologyCategory {
  if (category.trim() === '') {
    throw new Error('TechnologyCategory must not be empty');
  }
  return category as TechnologyCategory;
}

/**
 * A technology that can be detected on a scanned website.
 *
 * No factory function is provided — `Technology` is a plain data
 * structure. The `id` is already a branded type (`TechnologyId`) that
 * enforces non-emptiness, and `category` uses the branded
 * `TechnologyCategory` type. There is no additional invariant that a
 * factory would enforce.
 */
export interface Technology {
  readonly id: TechnologyId;
  readonly name: string;
  readonly category: TechnologyCategory;
}
