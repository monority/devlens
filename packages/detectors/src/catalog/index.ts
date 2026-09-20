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
  ResourceContentSignature,
  LinkSignature,
  RelationshipDef,
  RelationshipType,
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
 * Returns the declarative relationship edges declared by the technology
 * with the given id (Step 69). Empty when the technology declares no
 * relationships — this is the common case and is safe for the
 * relationship-resolution layer to skip.
 */
export function relationshipsFor(sourceId: string): readonly RelationshipDef[] {
  return findDefinition(sourceId)?.relationships ?? [];
}

/**
 * Returns `true` if the given relationship type is one of the three
 * semantically-valid kinds (`implies` / `requires` / `excludes`).
 */
export function isValidRelationshipType(type: unknown): type is RelationshipType {
  return type === 'implies' || type === 'requires' || type === 'excludes';
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
export function signaturesFor(kind: 'resource_content'): readonly ResourceContentSignature[];
export function signaturesFor(kind: 'link'): readonly LinkSignature[];
export function signaturesFor(
  kind:
    'header' | 'meta' | 'script_url' | 'content_script' | 'resource' | 'resource_content' | 'link',
): readonly (
  | HeaderSignature
  | MetaTagSignature
  | ScriptUrlSignature
  | ContentScriptSignature
  | ResourceSignature
  | ResourceContentSignature
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
    case 'resource_content':
      return TECHNOLOGY_DEFINITIONS.flatMap((d) => d.resourceContentSignatures ?? []);
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
export function validateDefinition(def: TechnologyDefinition, knownIds?: Set<string>): string[] {
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
    ...(def.resourceContentSignatures ?? []),
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

  // ─── Step 69: relationship validation (per-definition) ────────────
  // `knownIds` lets us also reject references to unknown technology ids;
  // it is only available when validating the full catalog. Self-references,
  // duplicates, and invalid types are self-contained and always checked.
  errors.push(...validateRelationships(def, knownIds));

  return errors;
}

/**
 * Validates the `relationships` declared by a single definition.
 *
 * Checks (each emits a distinct error):
 * - an invalid relationship `type` (not one of `implies`/`requires`/`excludes`)
 * - an empty/whitespace `target` id
 * - a self-reference (`target === def.id`)
 * - a duplicate `(type, target)` pair within the same definition
 * - a reference to an unknown technology id (only when `knownIds` is set)
 *
 * Cross-definition cycle detection is performed separately by
 * `validateDefinitions` (it requires the full graph).
 */
export function validateRelationships(def: TechnologyDefinition, knownIds?: Set<string>): string[] {
  const errors: string[] = [];
  const rels = def.relationships;
  if (!rels || rels.length === 0) {
    return errors;
  }

  const seen = new Set<string>();
  for (const rel of rels) {
    if (!isValidRelationshipType(rel.type)) {
      errors.push(
        `Technology "${def.id}" has a relationship with invalid type "${String(rel.type)}"`,
      );
      continue;
    }
    if (!rel.target || typeof rel.target !== 'string' || rel.target.trim() === '') {
      errors.push(`Technology "${def.id}" has a relationship with an empty target id`);
      continue;
    }
    if (rel.target === def.id) {
      errors.push(
        `Technology "${def.id}" has a self-referential relationship (${rel.type} → itself)`,
      );
    }
    const key = `${rel.type}→${rel.target}`;
    if (seen.has(key)) {
      errors.push(`Technology "${def.id}" has a duplicate relationship (${key})`);
    }
    seen.add(key);

    if (knownIds !== undefined && !knownIds.has(rel.target)) {
      errors.push(
        `Technology "${def.id}" relationship "${rel.type}" references unknown technology "${rel.target}"`,
      );
    }
  }

  return errors;
}

/**
 * Validates a list of definitions, including cross-definition integrity:
 * duplicate ids are rejected, relationship targets are checked against the
 * full id set, and relationship cycles (direct / transitive) are detected.
 * Aggregates {@link validateDefinition} results.
 *
 * Step 69 adds: unknown-referenced-id rejection and cycle detection over the
 * full relationship graph. Self-references and duplicates are caught per
 * definition by `validateDefinition` — here we additionally catch
 * direct two-step cycles (`A↔B`) and longer transitive cycles
 * (`A→B→C→A`).
 */
export function validateDefinitions(defs: readonly TechnologyDefinition[]): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  // Pre-build the full set of known ids so that a relationship referencing
  // a technology declared *later* in the array is not wrongly rejected as
  // "unknown" (e.g. Next.js → React, where Next.js precedes React).
  const idSet = new Set<string>();
  for (const def of defs) {
    if (def.id && def.id.trim() !== '') {
      idSet.add(def.id);
    }
  }

  for (const def of defs) {
    if (def.id && def.id.trim() !== '') {
      if (seenIds.has(def.id)) {
        errors.push(`Duplicate technology id: "${def.id}"`);
      }
      seenIds.add(def.id);
    }
    errors.push(...validateDefinition(def, idSet));
  }

  // Step 69: relationship cycle detection across the full graph.
  errors.push(...detectRelationshipCycles(defs));

  return errors;
}

/**
 * Detects cycles in the relationship graph (any edge type — `implies`,
 * `requires`, `excludes` all participate). Self-references are already
 * rejected by `validateDefinition`; this catches 2-cycles and longer
 * transitive cycles.
 *
 * Uses iterative DFS colouring (WHITE unvisited, GRAY on-stack, BLACK
 * done) to avoid stack growth on wide graphs and to remain deterministic:
 * nodes are visited in id-sorted order, and the reported cycle path is
 * canonical (starting from the earliest id in the cycle).
 */
function detectRelationshipCycles(defs: readonly TechnologyDefinition[]): string[] {
  const errors: string[] = [];

  const graph = new Map<string, string[]>();
  const ids = new Set<string>();
  for (const def of defs) {
    if (def.id && def.id.trim() !== '') {
      ids.add(def.id);
      if (def.relationships && def.relationships.length > 0) {
        // Self-references are already rejected per-definition by
        // `validateDefinition`; exclude them here so the graph check only
        // reports genuine multi-node cycles.
        const targets = def.relationships.filter((r) => r.target !== def.id).map((r) => r.target);
        graph.set(def.id, targets);
      }
    }
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  // path stack for cycle reconstruction (deterministic id-sorted traversal).
  const stack: string[] = [];

  const visit = (start: string) => {
    // Iterative DFS with explicit colour + stack tracking.
    const work: Array<{ node: string; edges: string[]; i: number }> = [
      { node: start, edges: (graph.get(start) ?? []).slice().sort(), i: 0 },
    ];
    color.set(start, GRAY);
    stack.push(start);

    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const edges = frame.edges;
      if (frame.i < edges.length) {
        const next = edges[frame.i]!;
        frame.i += 1;
        const nextColor = color.get(next) ?? WHITE;
        if (nextColor === GRAY) {
          // Found a cycle: reconstruct the cycle path from the stack
          // starting at `next` (the re-entered node), then close it.
          const cycleStart = stack.indexOf(next);
          const cycle = stack.slice(cycleStart).concat(next);
          errors.push(`Technology relationship cycle detected: ${cycle.join(' → ')}`);
        } else if (nextColor === WHITE) {
          color.set(next, GRAY);
          stack.push(next);
          work.push({
            node: next,
            edges: (graph.get(next) ?? []).slice().sort(),
            i: 0,
          });
        }
        // nextColor === BLACK → already explored, skip.
      } else {
        // Done with this frame.
        color.set(frame.node, BLACK);
        stack.pop();
        work.pop();
      }
    }
  };

  for (const id of [...ids].sort()) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      visit(id);
    }
  }

  return errors;
}

/**
 * Convenience wrapper that validates the real catalog. Used by the
 * module-load fail-fast guard below.
 *
 * Step 69: the real catalog's three relationships
 * (`woocommerce requires wordpress`, `nextjs implies react`,
 * `nuxtjs implies vue`) all resolve to known ids and form no cycles, so
 * this still returns an empty array.
 */
export function validateCatalog(): readonly string[] {
  return validateDefinitions(TECHNOLOGY_DEFINITIONS);
}

// Fail fast at module load if the catalog is internally inconsistent.
const __validationErrors = validateCatalog();
if (__validationErrors.length > 0) {
  throw new Error(`Catalog validation failed:\n  - ${__validationErrors.join('\n  - ')}`);
}
