/**
 * Declarative technology catalog — composition layer.
 *
 * This module is the single source of truth for **what technologies the
 * system can detect** and **how** (their signatures). Each technology lives
 * in its own file under `catalog/technologies/<id>.ts` as a single
 * {@link TechnologyDefinition}; this module imports every one of them,
 * composes `TECHNOLOGY_DEFINITIONS`, and exposes the two accessors the
 * detectors use:
 *
 * - `TECHNOLOGY_DEFINITIONS` — the ordered array of all definitions.
 * - `signaturesFor(kind)` — flattens every definition's signatures for a
 *   given observable source into the typed array a detector consumes.
 *
 * Per-technology signature ordering is preserved (it is semantically
 * meaningful for `ScriptUrlDetector`/`ResourceDetector`/`LinkDetector`,
 * which prefer the first matching signature of a technology for evidence).
 * Cross-technology ordering is NOT significant — `ScoringDetector#rank`
 * re-sorts final detections by `confidence DESC, id ASC`.
 *
 * A lightweight {@link validateCatalog} guard runs once at module load so
 * that an inconsistent/broken definition fails loudly at startup rather
 * than silently degrading detection.
 */

import type {
  HeaderSignature,
  MetaTagSignature,
  ScriptUrlSignature,
  ContentScriptSignature,
  ResourceSignature,
  LinkSignature,
  TechnologyDefinition,
} from './types.js';
import { nginx } from './technologies/nginx.js';
import { apache } from './technologies/apache.js';
import { iis } from './technologies/iis.js';
import { caddy } from './technologies/caddy.js';
import { openresty } from './technologies/openresty.js';
import { litespeed } from './technologies/litespeed.js';
import { tomcat } from './technologies/tomcat.js';
import { php } from './technologies/php.js';
import { wordpress } from './technologies/wordpress.js';
import { drupal } from './technologies/drupal.js';
import { webflow } from './technologies/webflow.js';
import { hugo } from './technologies/hugo.js';
import { jekyll } from './technologies/jekyll.js';
import { ghost } from './technologies/ghost.js';
import { prestashop } from './technologies/prestashop.js';
import { typo3 } from './technologies/typo3.js';
import { joomla } from './technologies/joomla.js';
import { craftCms } from './technologies/craft-cms.js';
import { mediawiki } from './technologies/mediawiki.js';
import { express } from './technologies/express.js';
import { laravel } from './technologies/laravel.js';
import { nextjs } from './technologies/nextjs.js';
import { nuxtjs } from './technologies/nuxtjs.js';
import { gatsby } from './technologies/gatsby.js';
import { react } from './technologies/react.js';
import { vue } from './technologies/vue.js';
import { angular } from './technologies/angular.js';
import { svelte } from './technologies/svelte.js';
import { astro } from './technologies/astro.js';
import { ember } from './technologies/ember.js';
import { backbone } from './technologies/backbone.js';
import { bootstrap } from './technologies/bootstrap.js';
import { jquery } from './technologies/jquery.js';
import { lodash } from './technologies/lodash.js';
import { tailwind } from './technologies/tailwind.js';
import { htmx } from './technologies/htmx.js';
import { turbo } from './technologies/turbo.js';
import { stimulus } from './technologies/stimulus.js';
import { alpinejs } from './technologies/alpinejs.js';
import { d3 } from './technologies/d3.js';
import { popperjs } from './technologies/popperjs.js';
import { firebase } from './technologies/firebase.js';
import { shopify } from './technologies/shopify.js';
import { woocommerce } from './technologies/woocommerce.js';
import { bigcommerce } from './technologies/bigcommerce.js';
import { googleFonts } from './technologies/google-fonts.js';
import { googleAnalytics } from './technologies/google-analytics.js';
import { plausible } from './technologies/plausible.js';
import { googleTagManager } from './technologies/google-tag-manager.js';
import { matomo } from './technologies/matomo.js';
import { segment } from './technologies/segment.js';
import { cloudflare } from './technologies/cloudflare.js';
import { fastly } from './technologies/fastly.js';
import { vercel } from './technologies/vercel.js';

/**
 * The canonical, ordered list of every technology definition.
 *
 * New technologies are added solely by appending a `catalog/technologies/<id>.ts`
 * definition to this array.
 */
export const TECHNOLOGY_DEFINITIONS: readonly TechnologyDefinition[] = [
  // ── Servers ───────────────────────────────────────────────
  nginx,
  apache,
  iis,
  caddy,
  openresty,
  litespeed,
  tomcat,
  // ── Languages ─────────────────────────────────────────────
  php,
  // ── CMS ───────────────────────────────────────────────────
  wordpress,
  drupal,
  webflow,
  hugo,
  jekyll,
  ghost,
  prestashop,
  typo3,
  joomla,
  craftCms,
  mediawiki,
  // ── Frameworks ─────────────────────────────────────────────
  express,
  laravel,
  nextjs,
  nuxtjs,
  gatsby,
  react,
  vue,
  angular,
  svelte,
  astro,
  ember,
  backbone,
  bootstrap,
  // ── Libraries ──────────────────────────────────────────────
  jquery,
  lodash,
  tailwind,
  htmx,
  turbo,
  stimulus,
  alpinejs,
  d3,
  popperjs,
  // ── Services ───────────────────────────────────────────────
  firebase,
  shopify,
  woocommerce,
  bigcommerce,
  googleFonts,
  googleAnalytics,
  plausible,
  googleTagManager,
  matomo,
  segment,
  // ── CDNs / edge ────────────────────────────────────────────
  cloudflare,
  fastly,
  vercel,
];

/**
 * Looks up a technology definition by id.
 */
export function findDefinition(id: string): TechnologyDefinition | undefined {
  return TECHNOLOGY_DEFINITIONS.find((d) => d.id === id);
}

/**
 * Flattens every definition's signatures for a given observable source into
 * the typed array a detector consumes (preserving per-technology order).
 *
 * Cross-technology order is irrelevant (the scorer re-sorts); only the
 * within-technology signature order — which is preserved per definition file
 * — is meaningful.
 */
export function signaturesFor(kind: 'header'): readonly HeaderSignature[];
export function signaturesFor(kind: 'meta'): readonly MetaTagSignature[];
export function signaturesFor(kind: 'script_url'): readonly ScriptUrlSignature[];
export function signaturesFor(kind: 'content_script'): readonly ContentScriptSignature[];
export function signaturesFor(kind: 'resource'): readonly ResourceSignature[];
export function signaturesFor(kind: 'link'): readonly LinkSignature[];
export function signaturesFor(
  kind: 'header' | 'meta' | 'script_url' | 'content_script' | 'resource' | 'link',
): readonly (
  | HeaderSignature
  | MetaTagSignature
  | ScriptUrlSignature
  | ContentScriptSignature
  | ResourceSignature
  | LinkSignature
)[] {
  switch (kind) {
    case 'header':
      return TECHNOLOGY_DEFINITIONS.flatMap((d) => d.headerSignatures ?? []);
    case 'meta':
      return TECHNOLOGY_DEFINITIONS.flatMap((d) => d.metaSignatures ?? []);
    case 'script_url':
      return TECHNOLOGY_DEFINITIONS.flatMap((d) => d.scriptUrlSignatures ?? []);
    case 'content_script':
      return TECHNOLOGY_DEFINITIONS.flatMap((d) => d.contentSignatures ?? []);
    case 'resource':
      return TECHNOLOGY_DEFINITIONS.flatMap((d) => d.resourceSignatures ?? []);
    case 'link':
      return TECHNOLOGY_DEFINITIONS.flatMap((d) => d.linkSignatures ?? []);
    default:
      return [];
  }
}

/**
 * Validates a single technology definition (signature integrity, confidence
 * range, version-rule shape, non-empty signature list). Does NOT check
 * cross-definition id uniqueness — use {@link validateDefinitions} for that.
 *
 * Returns a list of human-readable error strings (empty when the definition
 * is well-formed).
 */
export function validateDefinition(def: TechnologyDefinition): string[] {
  const errors: string[] = [];

  if (!def.id || typeof def.id !== 'string' || def.id.trim() === '') {
    errors.push(`Technology definition with empty id (name="${def.name}")`);
  }
  if (!def.name || def.name.trim() === '') {
    errors.push(`Technology with id="${def.id ?? ''}" has an empty name`);
  }
  if (!def.category || def.category.trim() === '') {
    errors.push(`Technology with id="${def.id ?? ''}" has an empty category`);
  }

  const allSigs = [
    ...(def.headerSignatures ?? []),
    ...(def.metaSignatures ?? []),
    ...(def.scriptUrlSignatures ?? []),
    ...(def.contentSignatures ?? []),
    ...(def.resourceSignatures ?? []),
    ...(def.linkSignatures ?? []),
  ];

  const sigSeen = new Set<string>();
  for (const sig of allSigs) {
    if (sig.technologyId !== def.id) {
      errors.push(
        `Technology "${def.id}" has a signature whose technologyId is "${sig.technologyId}" (must match "${def.id}")`,
      );
    }
    if (
      typeof sig.confidence !== 'number' ||
      !Number.isFinite(sig.confidence) ||
      sig.confidence < 0 ||
      sig.confidence > 100
    ) {
      errors.push(
        `Technology "${def.id}" has a signature with invalid confidence ${sig.confidence}`,
      );
    }
    const sigKey = JSON.stringify(sig);
    if (sigSeen.has(sigKey)) {
      errors.push(`Technology "${def.id}" has a duplicate signature (${sigKey})`);
    }
    sigSeen.add(sigKey);

    if (sig.version !== undefined) {
      const v = sig.version;
      if (v.source !== 'matchedValue') {
        errors.push(
          `Technology "${def.id}" has version extraction with invalid source "${String(v.source)}"`,
        );
      }
      if (!(v.rule?.pattern instanceof RegExp)) {
        errors.push(`Technology "${def.id}" has a version rule without a RegExp pattern`);
      }
      if (
        v.rule?.captureGroup !== undefined &&
        (!Number.isInteger(v.rule.captureGroup) || v.rule.captureGroup < 0)
      ) {
        errors.push(`Technology "${def.id}" has an invalid captureGroup ${v.rule.captureGroup}`);
      }
    }
  }

  if (allSigs.length === 0) {
    errors.push(`Technology "${def.id}" has no signatures`);
  }

  return errors;
}

/**
 * Validates a list of definitions, including cross-definition integrity:
 * duplicate ids are rejected. Aggregates {@link validateDefinition} results.
 */
export function validateDefinitions(defs: readonly TechnologyDefinition[]): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const def of defs) {
    if (def.id && def.id.trim() !== '') {
      if (seenIds.has(def.id)) {
        errors.push(`Duplicate technology id: "${def.id}"`);
      }
      seenIds.add(def.id);
    }
    errors.push(...validateDefinition(def));
  }

  return errors;
}

/**
 * Convenience wrapper that validates the real catalog. Used by the
 * module-load fail-fast guard below.
 */
export function validateCatalog(): readonly string[] {
  return validateDefinitions(TECHNOLOGY_DEFINITIONS);
}

// Fail fast at module load if the catalog is internally inconsistent.
const __validationErrors = validateCatalog();
if (__validationErrors.length > 0) {
  throw new Error(`Catalog validation failed:\n  - ${__validationErrors.join('\n  - ')}`);
}
