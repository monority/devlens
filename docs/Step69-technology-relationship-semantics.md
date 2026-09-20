# Step 69 — Technology Relationship Semantics

This step adds a **declarative, deterministic relationship-resolution layer** that
runs _after_ scoring and classifies each detection as either a **direct
observation** or a **relationship-derived** one, while surfacing
**conflicts** for impossible/improbable technology co-occurrences.

It introduces three relationship kinds — `implies`, `requires`, `excludes` — as
_catalog data only_, with no new crawler capability. The relationship engine
operates purely on the existing `SiteSnapshot` + already-scored `Detection`
objects.

---

## 1. Scope & constraints

- **No crawler changes.** No browser/DOM/CSS/cookie/DNS/TLS/favicon/XHR/JS-execution
  changes. Resolution works entirely on the scored detection list produced by
  the existing pipeline.
- **No scoring changes.** `ConfidenceScorer`/`ConfidenceScorer.score` is
  untouched. Direct-detection confidences are byte-identical to Step 68; derived
  detections carry `confidence: 0` and never participate in direct ranking
  (they sort below every direct detection). `confidence DESC,
technology.id ASC` ranking for direct detections is preserved.
- **Evidence is never fabricated.** Only direct observations carry `Evidence`.
  A derived detection carries _relationship provenance_, not evidence.
- **The `Detection` model is the source of truth.** `source` is optional;
  _absent_ ⇒ directly observed. Only `source === 'relationship'` is derived.
  This keeps every existing object literal, scorer output, and the
  `route.test.ts` exact-shape assertion `toEqual([{technology, confidence,
evidence}])` valid (absent fields are omitted from the API response).

---

## 2. The three relationships (catalog data)

Exactly three relationships are declared in the catalog, in three
technology definition files:

| Edge                      | Type       | Semantics                                                                                                                                                                                |
| ------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `woocommerce → wordpress` | `requires` | WooCommerce needs WordPress to run. If WordPress is not _directly_ observed, surface a `missing_requirement` conflict on the WooCommerce detection. WordPress is **never** auto-derived. |
| `nextjs → react`          | `implies`  | Next.js is built on React. If React is not already _directly_ observed, derive a React detection (conf `0`, no evidence/version) attributed to Next.js.                                  |
| `nuxtjs → vue`            | `implies`  | Nuxt.js is built on Vue. Same `implies` derivation rule as Next.js→React.                                                                                                                |

Catalog files:

- `packages/detectors/src/catalog/technologies/woocommerce.ts`
- `packages/detectors/src/catalog/technologies/nextjs.ts`
- `packages/detectors/src/catalog/technologies/nuxtjs.ts`

---

## 3. Semantics table

| Relationship | Source directly observed | Target directly observed | Effect on result set                                                                                                                                                |
| ------------ | ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `implies`    | yes                      | no                       | Derive target: `source: 'relationship'`, `confidence: 0`, `evidence: []`, `version: null`, `derivedFrom: [{source, sourceName, type:'implies'}]`.                   |
| `implies`    | yes                      | yes                      | No-op — target stays direct. `implies` is redundant, never re-derived.                                                                                              |
| `requires`   | yes                      | no                       | Attach `{type:'requires', other:<target>, reason:'missing_requirement'}` to the source detection. **Target is never derived.**                                      |
| `requires`   | yes                      | yes                      | No-op — requirement satisfied, no conflict.                                                                                                                         |
| `excludes`   | yes                      | yes                      | Attach `{type:'excludes', other:<target>, reason:'both_directly_observed'}` to the source detection. **Both detections are preserved** (evidence is never deleted). |
| `excludes`   | yes                      | no                       | No-op — no conflict; the absent target is simply not observed.                                                                                                      |

Key invariants:

- `requires` is a **validation** constraint — it never adds a detection.
- `excludes` is a **co-presence signal** — it never removes evidence or
  detections; it only annotates.
- `implies` only fires when the target is _absent_; directly observed targets
  are left exactly as the scorer produced them.

---

## 4. Domain model (Step 69 additions)

In `packages/core/src/domain/detection.ts`:

```ts
/** How a detection entered the result set. */
export type DetectionSource = 'direct' | 'relationship';

/** Provenance for a relationship-derived detection. */
export interface RelationshipProvenance {
  /** Technology id that implied this one. */
  readonly source: string;
  /** Human-readable name of the implying technology. */
  readonly sourceName: string;
  /** The relationship kind that produced the derivation. */
  readonly type: 'implies';
}

/** A conflict surfaced on a direct detection (excludes / requires). */
export interface RelationshipConflict {
  readonly type: 'excludes' | 'requires';
  readonly other: string;
  readonly reason: 'both_directly_observed' | 'missing_requirement';
}
```

`Detection` gains three **optional** fields (absent ⇒ directly observed, no
provenance):

```ts
export interface Detection {
  readonly technology: Technology;
  readonly confidence: Confidence; // 0–100
  readonly evidence: ReadonlyArray<Evidence>; // [] for derived
  readonly version: TechnologyVersion | null; // null for derived
  readonly source?: DetectionSource; // absent = direct
  readonly derivedFrom?: ReadonlyArray<RelationshipProvenance>;
  readonly relationshipConflicts?: ReadonlyArray<RelationshipConflict>;
}
```

Factory helpers:

```ts
// Creates a derived detection: conf 0, no evidence/version, sourced to the
// relationship provenance. Used only by the resolver for `implies`.
createDerivedDetection(technology, derivedFrom): Detection;

// Conflict constructors used to annotate a direct (declaring) detection.
createExcludesConflict(other): RelationshipConflict;   // both_directly_observed
createRequiresConflict(target): RelationshipConflict;  // missing_requirement
```

`createDetection` is **unchanged** — it produces a direct detection (no
`source`), so all existing scorer/detector output literals remain valid.

---

## 5. Catalog model (Step 69 additions)

In `packages/detectors/src/catalog/types.ts`:

```ts
export type RelationshipType = 'implies' | 'requires' | 'excludes';

export interface RelationshipDef {
  readonly type: RelationshipType;
  readonly target: string; // target technology id
}

export interface TechnologyDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  // …existing signature fields (all optional)…
  readonly relationships?: readonly RelationshipDef[];
}
```

Accessors added in `packages/detectors/src/catalog/index.ts`:

- `relationshipsFor(sourceId): readonly RelationshipDef[]` — relationships
  declared by a given technology.
- `isValidRelationshipType(type): boolean`.

---

## 6. Validation rules (Step 69)

Relationships are validated at catalog load; the **real catalog fails fast**
(`validateCatalog()` asserts `validateDefinitions(TECHNOLOGY_DEFINITIONS)` is
`[]`).

`validateDefinition(def, knownIds?)` rejects per-definition (a):

- **invalid relationship type** — `type` not in `implies | requires | excludes`;
- **empty target** — target is blank/whitespace;
- **self-reference** — `target === def.id`;
- **duplicate relationship** — same `(type, target)` pair declared twice on a
  single definition;
- **unknown referenced id** — `target` not in `knownIds` (checked only when a
  known-id set is supplied).

`validateDefinitions(defs)` runs a **two-pass** check:

1. Pre-build the complete `idSet` of all declared technology ids (first pass
   over all definitions), then validate each definition's relationships
   against that _complete_ set — so edges that reference technologies declared
   _later_ in the array (e.g. `nextjs → react`, `nuxtjs → vue`) are accepted.
2. Run `detectRelationshipCycles(defs)` — an **iterative DFS** using
   WHITE/GRAY/BLACK node coloring, with **id-sorted** root iteration and
   id-sorted edge iteration. A GRAY target encountered during a DFS frame
   closes a canonical cycle path reconstructed from the stack. This catches:
   - 2-cycles (`A → B → A`),
   - transitive cycles (`A → B → C → A`),
   - self-edges (also caught per-definition above; excluded from the graph
     build so they are not double-reported).

Self-edges are filtered out of the graph passed to the cycle detector to avoid
duplicate "self-referential" + "cycle" reports; the per-definition check owns
self-references.

---

## 7. The resolver engine

Implemented in `packages/detectors/src/relationships.ts` (single new file):

```ts
// Pure function: derives/conflicts a direct detection list.
export function resolveRelationships(
  direct: ReadonlyArray<Detection>,
  options?: RelationshipResolutionOptions,
): Detection[];

// Detector decorator: wraps an inner Detector and applies resolution.
export class RelationshipResolver implements Detector {
  constructor(inner: Detector, definitions?: TechnologyDefinition[]);
  detect(snapshot: SiteSnapshot): Detection[];
}
```

### Algorithm (deterministic)

1. Build an index of technology definitions (id → definition → `Technology`)
   from `options.definitions` (defaults to the real `TECHNOLOGY_DEFINITIONS`).
2. Build `directById` from the input `direct` list (all input is treated as
   directly observed).
3. **Conflict pass** over each direct detection (id-sorted):
   - For each `requires` edge where the target is **not** direct → attach a
     `missing_requirement` conflict.
   - For each `excludes` edge where the target **is** direct → attach a
     `both_directly_observed` conflict.
   - Direct detections returned **by reference** unless they carry a conflict
     (in which case a shallow copy + the `relationshipConflicts` array is
     returned, preserving evidence/version/confidence byte-for-byte).
4. **Derivation pass (`implies`) — BFS fixpoint** with a `visited` set:
   - Seed frontier = id-sorted sources that declare a live `implies` edge to a
     non-direct target.
   - For each seed `s`, for each `implies → t` where `t` is not direct, not
     already derived, and not yet visited: derive `t` (conf `0`, evidence `[]`,
     version `null`, `source: 'relationship'`, `derivedFrom:
[{source: s, sourceName, type: 'implies'}]`), mark `t` visited, enqueue
     `t` (so transitive `A → B → C` chains are followed: `B` derived from `A`,
     then `C` derived from `B`).
   - Edges are inspected in id-sorted order; **first claim wins**, so
     duplicate paths (`A → B`, `C → B`) derive `B` exactly once, attributed
     deterministically.
   - The `visited` set guarantees termination on cyclic graphs (defensive —
     the validator rejects cycles at load, but the resolver never loops).
5. **Assemble output**: direct detections (in scorer order) followed by
   derived detections **sorted by `technology.id ASC`** (deterministic,
   order-independent of the direct input).

### Invariants guaranteed

- Derived `confidence` is `0` (ranked below all direct detections).
- Derived `evidence` is `[]`; derived `version` is `null`.
- Direct detections' `confidence`, `evidence`, and `version` are never mutated.
- `implies` never fires when the target is directly observed.
- `requires` never derives a detection (validation only).
- `excludes` never deletes evidence or detections.
- Output is deterministic: identical input ⇒ identical output
  (`JSON.stringify`-stable); derived _set_ is order-independent of direct
  input order (direct order is preserved as the scorer's, by design).

---

## 8. Pipeline placement (Step 69)

The resolver is wired **once**, as the outermost layer of the production
detector:

```ts
// packages/detectors/src/production-detector.ts
export function createProductionDetector(): Detector {
  return new RelationshipResolver(
    new ScoringDetector(
      new DeduplicatingDetector(new CompositeDetector([...detectors...])),
      new ConfidenceScorer(),
    ),
  );
}
```

- It wraps `ScoringDetector` — resolution runs **after** dedup + scoring.
- It is the **outermost** layer, so downstream consumers (the worker, the API
  handler) receive direct-vs-derived classification with no other pipeline
  changes required.
- The **golden-fixtures harness** uses its own `makeRealPipeline()`
  (`ScoringDetector(DeduplicatingDetector(CompositeDetector([...])))`) and is
  deliberately _not_ wrapped — golden assertions remain bulletproof to the
  resolver. Only `realworld-audit.test.ts`, `production-detector.test.ts`, and
  the API/workers use `createProductionDetector()`.

---

## 9. API & UI exposure (Step 69)

`packages/core` re-exports the new types; `packages/detectors` re-exports
`resolveRelationships`, `RelationshipResolver`, `RelationshipResolutionOptions`,
`relationshipsFor`, and `validateRelationships`.

### Web API (`apps/web/src/app/api/scans/handler.ts`)

`detectionToResponse` maps a `Detection` → `DetectionResponse`, carrying:

```ts
interface DetectionResponse {
  technology: TechnologyResponse;
  confidence: number;
  evidence: EvidenceResponse[];
  version?: string; // omitted when null
  source?: 'direct' | 'relationship'; // omitted when absent (direct)
  derivedFrom?: ReadonlyArray<{ source: string; sourceName: string; type: 'implies' }>; // omitted when absent
  relationshipConflicts?: ReadonlyArray<{
    type: 'excludes' | 'requires';
    other: string;
    reason: string;
  }>; // omitted when absent
}
```

All new fields are **omitted when absent** (exact-optional-property semantics),
so the existing `route.test.ts` exact-shape assertion
`toEqual([{technology, confidence, evidence}])` for mock-detector responses is
unchanged.

### Web presentation

- `lib/scan-detection-results.ts` threads `source`/`derivedFrom`/
  `relationshipConflicts` through (omitted when absent); a zero-confidence
  derived detection still sorts last under `confidence DESC`.
- `components/DetectionItem.tsx` renders an amber **"Derived from
  {sourceName} (implies)"** badge in the detection header for
  `source === 'relationship'`, and a red **"Conflict: {type}
  ({other})"** badge when `relationshipConflicts` is non-empty. Direct
  detections render exactly as before.
- CSS classes `.derived` / `.relationshipConflict` are additive to
  `ScanCard.module.css`.

---

## 10. Persistence (Step 69)

`snapshots.detections` is stored as `jsonb` and round-trips the entire
`Detection[]`. Because the new fields are optional and serialized inline, **no
schema migration and no row-mapper changes are required**. `snapshot-mapping.test.ts`
adds explicit round-trip cases for a derived detection and for a direct
detection carrying a conflict.

---

## 11. Files added / changed (Step 69)

| Area     | File                                                   | Change                                                                                                                                                                                      |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core     | `packages/core/src/domain/detection.ts`                | `DetectionSource`, `RelationshipProvenance`, `RelationshipConflict`; optional `Detection` fields; `createDerivedDetection` / `createExcludesConflict` / `createRequiresConflict` factories. |
| Catalog  | `packages/detectors/src/catalog/types.ts`              | `RelationshipType`, `RelationshipDef`, `relationships?` on `TechnologyDefinition`.                                                                                                          |
| Catalog  | `packages/detectors/src/catalog/index.ts`              | `validateRelationships`, two-pass `idSet` in `validateDefinitions`, `detectRelationshipCycles`, `relationshipsFor`, `isValidRelationshipType`.                                              |
| Catalog  | `…/technologies/{woocommerce,nextjs,nuxtjs}.ts`        | The three declared relationships.                                                                                                                                                           |
| Engine   | `packages/detectors/src/relationships.ts`              | NEW — pure `resolveRelationships` + `RelationshipResolver` decorator.                                                                                                                       |
| Pipeline | `packages/detectors/src/production-detector.ts`        | `RelationshipResolver` wraps `ScoringDetector`.                                                                                                                                             |
| Barrel   | `packages/detectors/src/index.ts`                      | Re-exports.                                                                                                                                                                                 |
| Web      | `apps/web/src/app/api/scans/handler.ts`                | `detectionToResponse` + `DetectionResponse`.                                                                                                                                                |
| Web      | `apps/web/src/lib/types.ts`                            | `DetectionResponse` mirror.                                                                                                                                                                 |
| Web      | `apps/web/src/lib/scan-detection-results.ts`           | Propagate relationship fields (omit when absent).                                                                                                                                           |
| Web      | `apps/web/src/components/DetectionItem.tsx`            | Derived / conflict badges.                                                                                                                                                                  |
| Web      | `apps/web/src/components/ScanCard.module.css`          | `.derived` / `.relationshipConflict`.                                                                                                                                                       |
| Tests    | `packages/detectors/src/relationships.test.ts`         | NEW — 22-case resolver matrix.                                                                                                                                                              |
| Tests    | `packages/detectors/src/relationship-pipeline.test.ts` | NEW — 6 end-to-end pipeline regressions.                                                                                                                                                    |
| Tests    | `packages/detectors/src/catalog-validation.test.ts`    | +12 relationship validation cases.                                                                                                                                                          |
| Tests    | `packages/database/src/snapshot-mapping.test.ts`       | +3 relationship round-trip cases.                                                                                                                                                           |
| Tests    | `apps/web/src/components/DetectionItem.test.tsx`       | +6 derived/conflict rendering cases.                                                                                                                                                        |
| Tests    | `apps/web/src/lib/scan-detection-results.test.ts`      | +5 relationship-metadata propagation cases.                                                                                                                                                 |

---

## 12. Real-world regression

Verified green (existing direct detections unchanged — no spurious derivation
or conflict in any pre-existing fixture):

- **WordPress** (R1), **Cloudflare**, **PHP**, **jQuery**, **Shopify**,
  **Google Fonts**, **Google Analytics**, **GTM**, **Next.js+React+Vercel**
  coexist, **Angular** (G1/G2) — all unchanged because no relationship fires
  where the target is absent, and `requires`/`excludes` never derive.
- **`woocommerce` fixture**: WordPress is direct ⇒ `requires` is satisfied ⇒ no
  conflict, no derivation.
- **`nextjs-react-coexist` fixture**: React is direct ⇒ `implies` is redundant
  ⇒ no derivation.

The only new derivation in the real catalog — React from a standalone
Next.js detection — is covered by an explicit end-to-end test
(`nextjs implies react: derives React …`).
