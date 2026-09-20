# Step 72 — Advanced Version Intelligence

Extends devLens version detection with **observable conflict reporting** and
**version provenance**, without inventing or fabricating any version. This is
the Step-72 deliverable built on top of the Step-67/71 versioning substrate
(commit `6a4d432`).

## Mission (§0)

A technology's detected version must be:

- **resolved** (when evidence agrees),
- **refused** (when evidence disagrees — surfaced as an observable conflict,
  never an arbitrary pick), or
- **absent** (never a placeholder, never `latest`/`unknown`/`current`).

## What was already in place (§2 audit, DO NOT redo)

The Step-67/71 baseline already contained most of the mechanism:

- `packages/detectors/src/version.ts` — `VersionRule`, `extractVersion`
  (pure, regex-safe, `match === null → null`).
- `packages/core/src/domain/value-objects.ts` — `TechnologyVersion` brand via
  `createTechnologyVersion` (rejects non-string / empty / multiline / >64 chars).
- `packages/detectors/src/deduplicating-detector.ts` — `selectVersion`, a
  silent consensus over the dedup group (distinct versions → `null`).
- `packages/detectors/src/detection-scorer.ts` — rebuilds `Detection` with
  only `{ technology, confidence, evidence, version }`.
- `packages/database/src/postgres-repository.ts` — `detections` stored as
  transparent `jsonb` (no schema/migration for additive fields).
- `~20 technologies` already declare a `version` rule (apache, caddy, nginx,
  php, wordpress, jquery, …).
- `packages/core/src/domain/detection.ts` — `Detection.version?: TechnologyVersion | null`.

## What Step 72 adds

1. **Observable conflict** — `Detection.versionConflict?: boolean`. `true` when
   the consensus layer observed disagreeing versions. The resolved `version` is
   `null` in that case.
2. **Version provenance** — `Detection.versionSource?: VersionSource` (the
   evidence-source modality the resolved version came from) and
   `Detection.versionEvidence?: Evidence[]` (the evidence that yielded it, or
   the disagreeing evidence on a conflict).
3. **`VersionSource` / `VersionObservation`** — a stable union and observation
   type (`packages/core/src/domain/detection.ts`).
4. **`version-consensus.ts`** — a pure, deterministic consensus + provenance
   engine (`collectVersionObservations`, `resolveVersionConsensus`,
   `evidenceTypeToVersionSource`) that replaces the silent `selectVersion`
   body.
5. **§7 try/catch** around `value.match` (a pattern that throws on match can
   never crash a scan → `null`).
6. **§8 opt-in normalization** — `VersionRule.normalize: 'version'` strips a
   leading `v`/`V` or `version` word + whitespace. **Default off**, so every
   existing rule is byte-identical.
7. **§9 reserved-word rejection** — `createTechnologyVersion` rejects
   `latest`/`unknown`/`current` (case-insensitive).
8. **§15 Angular resource-content version rule** — `@angular/core` bundles
   embed `VERSION = { full: "<semver>" }`; the rule
   `/full:\s*["'](\d+(?:\.\d+){0,2})["']/` extracts it. Safe: the Angular
   resource-content signatures fire on no existing fixture (verified during
   Step 71), so this is zero-regression.
9. **Scorer preservation** — `ConfidenceScorer.score()` now preserves the
   three new fields (the scorer previously rebuilt `Detection` with only
   `{ technology, confidence, evidence, version }`, which would have dropped
   them before the API).
10. **§18 persistence** — `versionConflict` / `versionSource` /
    `versionEvidence` round-trip through the `jsonb` detections column with no
    migration; legacy rows (no version) still deserialize.
11. **§19/§20 API + UI** — `DetectionResponse.version?: string | null` (emits
    `{ version: null, versionConflict: true }` on conflict), `versionConflict?`
    and `versionSource?`; `DetectionItem` renders "Version: unavailable —
    conflict detected" instead of a fake version.

## §13 decision: `version: null` (not `undefined`)

The spec is internally inconsistent: §11/§13 say `undefined`, §19 shows
`"version": null`. Existing tests assert `.toBeNull()` in ~15 places and
`version ?? null` in `technology-versions.test.ts:42`. **Decision: keep
`version: TechnologyVersion | null` (`null` = absent).** `version ===
undefined` is satisfied operationally by `null` being falsy: the API omits
`version` when falsy, and the UI guards with `{version ? … : null}`. No
placeholder is ever fabricated. This deviates from the literal §13 wording and
avoids breaking the 15 `toBeNull()` assertions.

## Consensus model (§10 §12 §13)

`resolveVersionConsensus(observations)`:

| Observations                | Result                                                           |
| --------------------------- | ---------------------------------------------------------------- |
| ≥2, all same version        | `version`, no conflict, `source` set if all share one modality   |
| mixed sources, same version | `version`, no conflict, `source` **undefined** (ambiguous)       |
| exactly 1                   | `version` (strong single signal), `source` set                   |
| ≥2 distinct versions        | `version: null`, `conflict: true`, disagreeing evidence retained |
| 0                           | `version: null`, `conflict: false`                               |

Deterministic and order-independent: versions are bucketed in a `Map` keyed
by the version string, evidence is de-duplicated by canonical key and sorted.

## §23 integration cases

- **A** — header + meta agree → version kept, no conflict, `source` undefined
  (mixed sources).
- **B** — header (6.4.2) vs resource-content (8.2) disagree → conflict.
- **C** — single source (script-url d3) → version + source.
- **D** — no versioned observations → `null`, no conflict, no provenance.

Real-world regression guard (unchanged): `realworld-audit.test.ts` still
asserts wordpress `6.4.2`, php `8.2`, cloudflare `null`, jquery `null`. The
WordPress meta-generator and jQuery script-URL rules were **not** modified.

## Test coverage (§21 §22 §23)

- `version-consensus.test.ts` (NEW, 19 tests) — sources mapping, collection
  & provenance, consensus (×2/×3/strong-single/single-conflict/none),
  mixed-source agreement, determinism/order-independence, Cases A–D, and
  end-to-end `createDetection` provenance wiring.
- `version.test.ts` (+6) — §7 regex-throws → `null`, §8 normalization
  (`v3.7.1`, `V10.0`, `version 3.7.1`, `VERSION 3.7.1`, opt-in default-off),
  §9 reserved words / oversized / empty via `extractVersion`.
- `value-objects` — §9 covered via `createTechnologyVersion` (reserved-word
  rejection in `version.test.ts` co-located tests).
- `deduplicating-detector.test.ts` (+2) — conflict & agreement provenance on
  the existing consensus block.
- `technology-versions.test.ts` (+3) — Angular §15 end-to-end version +
  `versionSource`, LiteSpeed §13 absence, caddy `versionSource`.
- `catalog-validation.test.ts` (+2) — §26 invalid/accept `normalize`.
- `snapshot-mapping.test.ts` (+3) — §18 conflict / resolved / legacy jsonb
  round-trip of the new fields.

## §19 API coverage note

`detectionToResponse` is a pure function inside `handler.ts` (not separately
exported) whose module also imports `@devlens/application` at module scope.
The §19 response contract (`{ version: null, versionConflict: true }` and
`versionSource`) is therefore verified by:

- the `DetectionResponse` TypeScript contract
  (`version?: string | null; versionConflict?: boolean; versionSource?:
VersionSource`), type-checked by `apps/web` `tsc --noEmit`;
- the §18 jsonb round-trip test (the fields survive persistence); and
- the consensus tests (the flag is set correctly).

A dedicated `detectionToResponse` unit test would require exporting the
function and pulling the heavy `@devlens/application` graph into the web test
harness; this was intentionally avoided to keep the test environment
side-effect-free.

## Files changed (Step-72 set only)

Source: `core/.../detection.ts`, `core/.../value-objects.ts`,
`detectors/.../version.ts`, `detectors/.../version-consensus.ts` (NEW),
`detectors/.../deduplicating-detector.ts`, `detectors/.../detection-scorer.ts`,
`detectors/.../catalog/index.ts`, `detectors/.../catalog/technologies/angular.ts`.

Web: `apps/web/.../handler.ts`, `apps/web/.../lib/types.ts`,
`apps/web/.../components/DetectionItem.tsx`,
`apps/web/.../components/ScanCard.module.css`.

Tests: `version-consensus.test.ts` (NEW), `version.test.ts`,
`deduplicating-detector.test.ts`, `technology-versions.test.ts`,
`catalog-validation.test.ts`, `snapshot-mapping.test.ts`.

Docs: `docs/Step72-advanced-version-intelligence.md` (this file).

## Gates (§30)

- `pnpm typecheck` — 10 packages, exit 0.
- `pnpm exec eslint .` — exit 0.
- `pnpm exec prettier --check .` — all Step-72 files clean. (Pre-existing
  `docs/Step*.md` input specs and `.poolside/settings.local.yaml` are
  unformatted in the working tree but are never committed and are excluded
  from staging per §29.)
- `pnpm exec vitest run` — green, +35 new tests over the 2089 baseline.
- `pnpm build` — green (core → detectors → application → database → crawler →
  web).

## Commit (§29 §31)

`git add` the exact Step-72 paths only — never `git add -A`; never stage
`docs/Step*.md` input specs (incl. `docs/Step72.md`), `.poolside/`,
`.env*`, or `docs/Step70..md`/`docs/Step65.Md`/`docs/Step70-http-resource-intelligence.md`
(working-tree-only input artifacts). Commit message:
"Step 72: Advanced Version Intelligence".
