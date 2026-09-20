/**
 * Technology relationship resolution — Step 69.
 *
 * This layer sits **after** scoring and **before** the final `Detection[]`
 * result. It is a pure, deterministic post-processor that interprets the
 * declarative `implies` / `requires` / `excludes` edges declared in the
 * technology catalog and enriches the scoring output WITHOUT touching the
 * scorer:
 *
 * ```text
 * CompositeDetector → DeduplicatingDetector → ScoringDetector
 *                                                       ↓
 *                                                RelationshipResolver  (this layer)
 *                                                       ↓
 *                                            final Detection[] (direct + derived)
 * ```
 *
 * Semantics (see `docs/Step69-technology-relationship-semantics.md`):
 * - `implies` — observing A implies B. B is **derived** (a
 *   relationship-derived `Detection` with `source: 'relationship'`, no
 *   evidence, no version, confidence 0) when A is detected and B is **not
 *   already directly observed**. If B is already direct, the implication is
 *   redundant — nothing is derived (Phase 2).
 * - `requires` — A requires B. This is a **validation constraint**, never a
 *   derivation. If A is detected and B is not directly observed, a
 *   `requires` conflict is surfaced on A. B is never auto-derived.
 * - `excludes` — A and B are mutually exclusive. If BOTH are directly
 *   observed, an `excludes` conflict is surfaced on A (the declarer).
 *   Detections are **never deleted** — evidence is always preserved.
 *
 * Design rules enforced here:
 * - Direct detections are returned **by reference and in scorer order** when
 *   they carry no conflict (so existing exact-output / determinism tests are
 *   unaffected). Confidence is never recomputed (Phase 11).
 * - Derived detections are **appended** after the direct detections, sorted
 *   by `technology.id ASC` (deterministic), each carrying relationship
 *   provenance and NO evidence / NO version (Phase 4, Phase 10).
 * - Transitive `implies` chains are resolved to a fixpoint using a visited
 *   set; derivation follows each `implies` edge at most once per technology
 *   and is order-independent (Phase 6).
 * - The engine is pure: `resolveRelationships(direct, { definitions })` takes
 *   an explicit definitions list (defaulting to the production catalog) so the
 *   full test matrix can be exercised with crafted graphs without mocking the
 *   module.
 */

import type { Detector } from './detector.js';
import type {
  Detection,
  SiteSnapshot,
  Technology,
  RelationshipProvenance,
  RelationshipConflict,
} from '@devlens/core';
import {
  createDerivedDetection,
  createExcludesConflict,
  createRequiresConflict,
} from '@devlens/core';
import type { TechnologyDefinition, RelationshipType } from './catalog/types.js';
import { TECHNOLOGY_DEFINITIONS } from './catalog/index.js';

/** Options for {@link resolveRelationships}. */
export interface RelationshipResolutionOptions {
  /**
   * Catalog definitions used to derive the relationship graph. Defaults to
   * the production catalog (`TECHNOLOGY_DEFINITIONS`). Tests pass crafted
   * definition lists to exercise chains, conflicts, and cycle-free graphs.
   */
  readonly definitions?: readonly TechnologyDefinition[];
}

/** A normalized relationship edge. */
interface ResolvedEdge {
  readonly type: RelationshipType;
  readonly target: string;
}

/** Internal index built once from a definitions list. */
interface RelationshipIndex {
  /** id → Technology (for building derived detection objects). */
  readonly techById: Map<string, Technology>;
  /** source id → sorted list of edges (deterministic traversal). */
  readonly edgesBySource: Map<string, ResolvedEdge[]>;
}

/** Builds the relationship index from a definitions list (idempotent). */
function buildIndex(defs: readonly TechnologyDefinition[]): RelationshipIndex {
  const techById = new Map<string, Technology>();
  const edgesBySource = new Map<string, ResolvedEdge[]>();

  for (const def of defs) {
    const id = def.id;
    // Build a canonical Technology object from the definition. Skip defs
    // whose metadata is empty (the catalog validator already rejects these
    // at load time; this guard keeps the resolver robust for crafted input).
    if (id && id.trim() !== '' && def.name && def.category) {
      techById.set(id, {
        id: def.id as Technology['id'],
        name: def.name,
        category: def.category as Technology['category'],
      });
    }
    if (def.relationships && def.relationships.length > 0) {
      const edges = def.relationships.map((r) => ({ type: r.type, target: r.target }));
      // Deterministic traversal: sort by type ASC, then target ASC.
      edges.sort(
        (a, b) =>
          (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) ||
          (a.target < b.target ? -1 : a.target > b.target ? 1 : 0),
      );
      edgesBySource.set(id, edges);
    }
  }

  return { techById, edgesBySource };
}

/**
 * Resolves relationship semantics over a set of directly-observed
 * detections, returning the direct detections (with any attached
 * conflicts) followed by the derived detections (sorted by id ASC).
 *
 * The `direct` input is typically the output of the scoring layer; each
 * detection is treated as a direct observation. Derived detections carry
 * `source: 'relationship'` and never appear among the `direct` input.
 */
export function resolveRelationships(
  direct: readonly Detection[],
  options?: RelationshipResolutionOptions,
): Detection[] {
  const defs = options?.definitions ?? TECHNOLOGY_DEFINITIONS;
  const index = buildIndex(defs);

  // Direct observations keyed by id (the resolver does not re-score or
  // reorder the direct detections — it only reads them).
  const directById = new Map<string, Detection>();
  for (const d of direct) {
    directById.set(String(d.technology.id), d);
  }

  // ── implies derivation (BFS fixpoint) ────────────────────────────
  // derived: target id → immediate source (deterministic: first source
  // to claim a target wins). A visited set guards against re-expansion and
  // infinite loops on graphs that slipped past the catalog validator.
  const derived = new Map<string, RelationshipProvenance>();
  const visited = new Set<string>();

  // Seed the worklist with the directly-observed ids, id-sorted so the
  // derivation result is independent of input ordering.
  const worklist: string[] = [...directById.keys()].sort();
  // A naive FIFO queue; `visited` prevents reprocessing even if the queue
  // holds duplicates.
  let head = 0;
  while (head < worklist.length) {
    const cur = worklist[head]!;
    head += 1;
    if (visited.has(cur)) {
      continue;
    }
    visited.add(cur);

    const edges = index.edgesBySource.get(cur);
    if (!edges) {
      continue;
    }
    for (const edge of edges) {
      if (edge.type !== 'implies') {
        continue;
      }
      // Phase 2: an `implies` only derives when the target is NOT already
      // directly observed — a direct observation always wins.
      if (directById.has(edge.target)) {
        continue;
      }
      // First claim wins (deterministic via id-sorted traversal). Once
      // derived, a target is never re-derived from a different source.
      if (derived.has(edge.target)) {
        continue;
      }
      const provenance: RelationshipProvenance = {
        source: cur,
        sourceName: index.techById.get(cur)?.name ?? cur,
        type: 'implies',
      };
      derived.set(edge.target, provenance);
      worklist.push(edge.target);
    }
  }

  // ── requires / excludes conflicts (on direct detections only) ──
  const conflictsByTechId = new Map<string, RelationshipConflict[]>();
  const attach = (techId: string, conflict: RelationshipConflict) => {
    const existing = conflictsByTechId.get(techId);
    if (existing) {
      existing.push(conflict);
    } else {
      conflictsByTechId.set(techId, [conflict]);
    }
  };

  for (const [techId, directDetection] of directById) {
    const edges = index.edgesBySource.get(techId);
    if (!edges) {
      continue;
    }
    for (const edge of edges) {
      if (edge.type === 'requires') {
        // Missing-requirement conflict: the target is not directly observed.
        // (A `requires` edge NEVER derives its target — it is purely a
        // validation signal.) Requires satisfied only by a direct target.
        if (!directById.has(edge.target)) {
          attach(techId, createRequiresConflict(edge.target));
        }
      } else if (edge.type === 'excludes') {
        // Direct/direct conflict: both declared and co-observed. Evidence is
        // preserved on both — the conflict is surfaced, never destructive.
        if (directById.has(edge.target)) {
          attach(techId, createExcludesConflict(edge.target));
        }
      }
      // `implies` edges produce no conflict here — they derive instead.
    }
    // `directDetection` is referenced via directById; conflicts are attached
    // in the output assembly below (the lookup above used techId keys).
    void directDetection;
  }

  // ── Assemble output ──────────────────────────────────────────────
  // 1) Direct detections: preserve scorer order and identity. Attach a
  //    `relationshipConflicts` array ONLY where conflicts exist — direct
  //    detections with no conflicts are returned by reference, unchanged.
  const output: Detection[] = [];
  for (const d of direct) {
    const techId = String(d.technology.id);
    const conflicts = conflictsByTechId.get(techId);
    if (conflicts && conflicts.length > 0) {
      output.push({ ...d, relationshipConflicts: conflicts });
    } else {
      output.push(d);
    }
  }

  // 2) Derived detections: sorted by technology id ASC (deterministic),
  //    each carrying provenance and no evidence/version.
  for (const targetId of [...derived.keys()].sort()) {
    const technology = index.techById.get(targetId);
    if (!technology) {
      // Defensive: a derived target whose Technology is absent from the
      // definitions cannot be represented. Skip rather than fabricate.
      continue;
    }
    const provenance = derived.get(targetId)!;
    output.push(createDerivedDetection(technology, [provenance]));
  }

  return output;
}

/**
 * A {@link Detector} decorator that post-processes scoring output through
 * {@link resolveRelationships}. Placed after `ScoringDetector` in the
 * production pipeline so that relationship derivation never alters
 * per-signal confidence.
 *
 * ```ts
 * new RelationshipResolver(
 *   new ScoringDetector(new DeduplicatingDetector(...), new ConfidenceScorer()),
 * )
 * ```
 */
export class RelationshipResolver implements Detector {
  /**
   * @param inner        The scoring-layer detector whose output is enhanced.
   * @param definitions  Catalog definitions to derive the graph from
   *                     (defaults to the production catalog).
   */
  constructor(
    private readonly inner: Detector,
    private readonly definitions: readonly TechnologyDefinition[] = TECHNOLOGY_DEFINITIONS,
  ) {}

  detect(snapshot: SiteSnapshot): Detection[] {
    const direct = this.inner.detect(snapshot);
    return resolveRelationships(direct, { definitions: this.definitions });
  }
}
