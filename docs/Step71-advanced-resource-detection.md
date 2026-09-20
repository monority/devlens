# Step 71 — Advanced Resource-Based Detection

## Summary

Step 71 extends the Step-68 declarative catalog and the existing
`ResourceDetector` pattern one step further: it exploits the **bodies of
already-fetched secondary resources** (JS/CSS bundles acquired by Step-70's
HTTP Resource Intelligence) for declarative technology detection.

A new observation type — `resource_content` — is introduced, distinct from the
URL-based `resource` observation. A new sibling detector,
`ResourceContentDetector`, matches technology-specific fingerprints inside
fetched resource bodies. No new scoring/relationship architecture is
introduced: the new evidence feeds the existing `ConfidenceScorer` (where each
unique `Evidence['type']` is an independent evidence source) and the existing
`DeduplicatingDetector` (which dedups via `getEvidenceKey`).

The result: technologies whose strongest signal lives in an **external JS
bundle** (Angular, Vue, Svelte, Astro) can now be detected from the bundle
content, not only from inline page scripts.

## Relationship to prior steps

- **Step 68** — declarative per-technology catalog (`catalog/technologies/<id>.ts`
  - `TechnologyDefinition` + `signaturesFor`).
- **Step 70** — HTTP Resource Intelligence: the crawler discovers, selects,
  and acquires secondary resources (scripts, stylesheets, robots, manifest,
  favicon) into `snapshot.resources`, each with `acquisitionStatus`,
  `content`, `responseHeaders`, etc. **This is the prerequisite for Step 71**:
  without Step 70, `snapshot.resources` only carried CSS/robots bodies and
  never JS bundles.
- **Step 71** — inspects the bodies of the `script`/`css` resources that
  Step 70 fetched, adding a new evidence modality.

## What changed

### `packages/core` — domain

`packages/core/src/domain/evidence.ts`:

A new evidence variant:

```ts
export interface ResourceContentEvidence {
  readonly type: 'resource_content';
  readonly url: Url; // the fetched resource URL
  readonly resourceType: ResourceType; // 'script' | 'css' | ...
  readonly match: string; // the discriminating signature token
  readonly snippet: string; // bounded context around the match
}
```

Appended to the `Evidence` discriminated union. `packages/core/src/index.ts`
re-exports `* from './domain/evidence.js'`, so this propagates
transitively. No other core file changes.

### `packages/detectors` — catalog

`packages/detectors/src/catalog/types.ts`:

```ts
export interface ResourceContentSignature {
  readonly matchType: ResourceType; // which resource kind to inspect
  readonly matchContent: string; // case-insensitive substring (same as ResourceSignature)
  readonly technologyId: string;
  readonly confidence: number; // 0–100
  readonly version?: VersionExtraction;
}
```

plus `resourceContentSignatures?: readonly ResourceContentSignature[]` on
`TechnologyDefinition`.

> **Shape decision (spec §6.6).** The spec's `docs/Step71.md` example used
> `kind`/`pattern`/`matchMode?`, but §6.6 directs choosing a shape that matches
> the repository's real conventions. `packages/detectors/src/catalog/types.ts`
> already defines `ResourceSignature` with `matchType`/`matchContent`
> (substring, case-insensitive). `ResourceContentSignature` mirrors it **exactly**
> — the same matching predicate and the same factory (`getTechnology`,
> `extractVersion`). This means the new group is validated by the _existing_
> generic `allSigs` loop in `validateDefinition` with **zero new validation
> code**, and `ResourceContentDetector` is a structural twin of
> `ResourceDetector`. No `matchMode`/`regex` machinery is introduced.

`packages/detectors/src/catalog/index.ts`:

- `signaturesFor('resource_content')` overload + switch case (analogous to the
  existing `'resource'` branch).
- `validateDefinition`'s `allSigs` now spreads
  `...(def.resourceContentSignatures ?? [])`, so a definition whose _only_
  signatures are resource-content signatures is still valid (and is validated
  for confidence range / duplicate / version-rule shape).

`packages/detectors/src/evidence-key.ts`:

- Added the `case 'resource_content'` arm to the **exhaustive** `getEvidenceKey`
  switch (the switch has no `default`, so adding the `Evidence` union member
  required this arm or `tsc` fails with TS2366). The key includes
  `resourceType` + `match` so two different fingerprints on the same resource
  URL are kept distinct (not deduped).

`packages/detectors/src/index.ts`: re-exports `ResourceContentDetector` and the
`ResourceContentSignature` type.

### Catalog signatures added (Step 71 §9)

A deliberately small, strong set — four of the priority gaps — chosen for
tokens that survive **minification** (import-specifier string literals and
property-name accesses are preserved by default minifiers) and are
**technology-specific** (§7 — no generic `react`/`vue`/`component`/`router`
tokens):

| Technology | `matchType` | `matchContent`     | Confidence | Why it survives minification / is specific                                                              |
| ---------- | ----------- | ------------------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| Angular    | `script`    | `@angular/core`    | 95         | ESM import specifier (string literal) in every Angular app bundle.                                      |
| Angular    | `script`    | `__ng_context__`   | 90         | Angular Ivy renderer property written to host elements (property-name access, not mangled by default).  |
| Vue 3      | `script`    | `@vue/runtime-dom` | 92         | ESM import specifier emitted into SFC-compiled output / the Vue 3 runtime bundle.                       |
| Svelte 4   | `script`    | `svelte/internal`  | 90         | Runtime import specifier (string literal) in every Svelte 4 component bundle.                           |
| Astro      | `script`    | `__astro`          | 92         | Astro runtime global namespace (`window.__astro`), a property access preserved by default minification. |
| Astro      | `script`    | `astro-island`     | 85         | Custom-element tag name string registered in Astro's island-runtime bundle.                             |

Notes / honest limitations (§9 — prefer 4 well-fingerprinted techs over 30 weak
regexes):

- **React / Next.js / Nuxt.js** already have _stronger_ inline signals
  (`__REACT_DEVTOOLS__`, `__NEXT_DATA__`, `__NUXT__`) via `ContentScriptDetector`;
  a fetched React bundle exposes no unique non-generic token (bundlers rename
  `react`/`react-dom` bindings), so adding a resource-content signature there
  would risk generic-token false positives (§7). They are intentionally **not**
  added.
- **Vue 2** relies on existing inline/URL signals; Vue 2 bundles carry no
  unique minified token that isn't a §7 violation. Resource-content Vue
  detection targets Vue 3 (ESM) bundles.
- **Svelte** targets Svelte 4 (`svelte/internal`). Svelte 5 moved to `svelte`
  runes where the specifier `"svelte"` is too generic to use.

### `packages/detectors` — detector

`packages/detectors/src/resource-content-detector.ts` (new file):

- `class ResourceContentDetector implements Detector`.
- Reads `signaturesFor('resource_content')` once (eager, like
  `ResourceDetector`).
- For each signature, scans `snapshot.resources` for resources whose `type`
  matches `matchType` **and** whose (non-empty) `content` contains
  `matchContent` (case-insensitive substring — the identical predicate to
  `ResourceDetector`).
- When several resources satisfy a signature, the **lexicographically smallest
  URL** is chosen as the evidence source → the result is **independent of the
  resource array order** (Step 71 §12).
- Matches are grouped by `technologyId`; the group is reduced with the same
  `selectBestAndMerge` semantics as `ResourceDetector` (highest confidence,
  first-wins on ties, evidence merged and deduped by `getEvidenceKey`).
- Evidence is `ResourceContentEvidence` with a **bounded snippet**
  (`SNIPPET_RADIUS = 48` chars each side, `SNIPPET_MAX = 120`, whitespace
  collapsed) — never the full bundle (§5/§10).
- Pure, no I/O, no `fetch`, no browser/JS execution (§3 non-goals, §12).
- Empty `content` (`''`) is skipped — under the Step-70 invariant, only
  **fetched** resources carry a body (`failed`/`skipped`/`discovered` carry
  `''`, and oversized bodies fail acquisition rather than truncate), so a
  non-empty, `type`-matched body is a **full (bounded)** proof (§11).

### Pipeline wiring

`packages/detectors/src/production-detector.ts`:

`new ResourceContentDetector()` is appended to the `CompositeDetector` array
(after `ResourceDetector`, before `LinkDetector`). The outer stack
(`Composite → Deduplicating → Scoring → RelationshipResolver`) is unchanged;
`ResourceContentEvidence` automatically counts as a new independent evidence
_source_ in `ConfidenceScorer` (since `EvidenceSource = Evidence['type']`),
so content-based detections contribute the same diversity bonus as any other
source. `apps/web`, `apps/worker`, and `packages/application` all call
`createProductionDetector()`, so they pick up the new detector with no extra
wiring.

## What was explicitly NOT done (Step 71 §3 non-goals)

- No Playwright / headless browser / JS execution / DOM runtime.
- No `matchMode: 'regex'` engine or new scoring/relationship architecture
  (substring predicate + existing `ConfidenceScorer`/`DeduplicatingDetector`
  reused).
- No unbounded catalog expansion (4 target techs, strong signals only).
- No new downloads — only resources Step 70 already fetched (`script`/`css`
  with `acquisitionStatus === 'fetched'`, i.e. non-empty `content`).
- No full-bundle storage in evidence (bounded snippet + the matched token).
- No full JS AST / bundler / transpilation / de-minification. The "pretty vs
  minified" robustness comes from choosing tokens that are **inherently
  minification-invariant** (string-literal import specifiers and preserved
  property names), not from transforming the body.

## Detection flow (end-to-end)

```
crawl(url) ── Step 70 resource-intelligence ──> snapshot.resources
                                              [url, type, content,
                                               acquisitionStatus, ...]
         └─> createProductionDetector()
           └─> CompositeDetector([..., ResourceContentDetector(), ...])
               └─> ResourceContentDetector.detect(snapshot)
                   for each resourceContentSignature:
                     find smallest-URL resource { type===sig.matchType
                                                   && content includes sig.matchContent }
                     emit Detection(technology, confidence,
                                    [ResourceContentEvidence{url,resourceType,match,snippet}])
               └─> DeduplicatingDetector (dedup by technologyId; merge evidence by getEvidenceKey)
               └─> ScoringDetector -> ConfidenceScorer (base = best sig confidence; +5/source bonus, max +10)
               └─> RelationshipResolver (Step 69 implies/requires/excludes)
```

## Tests

- `packages/detectors/src/resource-content-detector.test.ts` (new) — 24 cases:
  Angular/Vue/Svelte/Astro match (pretty & minified bodies), evidence shape
  (`type`/`url`/`resourceType`/`match`/`snippet`), snippet boundedness,
  §7 negatives (bare `angular`/`vue`/`svelte`/`react`, wrong `resourceType`,
  `react-dom` not a signature), §11 empty/failed/skipped bodies ignored,
  §12 order-independence (smallest URL chosen regardless of resource order),
  §13 determinism (run 1 === 2 === 3), per-tech dedup, multi-signature merge,
  huge-body bounded snippet, and non-throwing edge cases.
- `packages/detectors/src/catalog-validation.test.ts` — Step-71 group:
  well-formed definitions accepted, invalid `confidence` (>100/NaN),
  mismatched `technologyId`, exact-duplicate signature, and the real catalog's
  four Step-71 techs remaining validation-clean.
- `packages/core/src/domain/evidence.test.ts` — structural test for
  `ResourceContentEvidence` in the union.
- `packages/database/src/snapshot-mapping.test.ts` — a `Detection` carrying a
  `ResourceContentEvidence` round-trips losslessly through the jsonb
  `snapshotToRow → rowToSnapshot` mappers (no schema/migration change).

## Regression safety

The full pre-Step-71 suite (2056 passed, Step 70) remains green and
**detection sets are unchanged**: the existing fixture snapshots carry
technology tokens only in inline `<script>` bodies (the
`ContentScriptDetector` domain) or in controlled CSS/robots/manifest
resources — never as JS-bundle bodies in `snapshot.resources`. The six new
`resourceContentSignatures` were verified not to match any existing fixture
resource body, so no existing technology count or evidence count changes.

After Step 71 the suite is **2089 passed, 18 skipped, 0 failed**, and
`pnpm typecheck` (10 packages), `pnpm exec eslint .`, `pnpm exec prettier
--check` (all Step-71 files), and `pnpm build` all pass.

## Spec deviations (documented)

1. **Signature shape.** Followed the repository's `ResourceSignature`
   convention (`matchType`/`matchContent`/substring) rather than the
   `docs/Step71.md` example's `kind`/`pattern`/`matchMode?`. Rationale: §6.6
   ("choisir la structure qui correspond réellement aux conventions du
   repository") — consistency with `ResourceSignature` and `ResourceDetector`
   means zero new validation/matching machinery. `matchMode` is therefore not
   present (substring-only, case-insensitive, identical to `ResourceSignature`).
2. **No web-UI changes.** `apps/web` renders `EvidenceResponse` via its
   documented `default` fallback ("Safely handles unknown / future evidence
   types without crashing"). The full evidence payload (url, resourceType,
   match, snippet) is present in the API response — the evidence itself is
   fully explainable (§5/§10); only cosmetic UI rendering for the new type
   uses the generic fallback, which is the designed extensibility path.
