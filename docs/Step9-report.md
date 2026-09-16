# Step 9 — Detection Explainability & Evidence Quality — Report

## Executive Summary

Step 9 establishes **explainability and evidence quality** for every
detection. The audit found that the existing `Detection` model
(`{ technology, confidence, evidence }`) and `Evidence` discriminated
union are already well-structured. The key gap was **evidence
deduplication fragility** (using `JSON.stringify` as a key) and the
**lack of canonical evidence ordering**.

Two minimal changes were made:

1. Introduced `getEvidenceKey(evidence)` — a deterministic,
   property-order-independent canonicalization function (in
   `packages/detectors/src/evidence-key.ts`).
2. Replaced `JSON.stringify` with `getEvidenceKey` in
   `DeduplicatingDetector`, `ResourceDetector`, and `LinkDetector`, and
   added canonical evidence sorting in `DeduplicatingDetector.mergeEvidence()`.

No new evidence types, no new detectors, no scoring changes. 48 new tests
were added. All invariants (A–E) are now enforced and tested.

## Audit Findings

### Current Detection model

```text
Detection {
  technology: Technology   // { id, name, category } from TechnologyCatalog
  confidence: Confidence   // brand: number in [0, 100] — final scored value
  evidence: Evidence[]     // ≥1 item (Invariant A, enforced by createDetection)
}
```

The `createDetection` factory already throws if `evidence` is empty.
✅ Invariant A satisfied.

### Current Evidence model

The `Evidence` discriminated union has 8 variant types, all
machine-readable with explicit `type` discriminants:

| Evidence type       | Fields                                                  |
| ------------------- | ------------------------------------------------------- |
| `http_header`       | `name`, `value`                                         |
| `meta_tag`          | `name`, `content`                                       |
| `script_url`        | `url`                                                   |
| `script_content`    | `snippet` (matched fingerprint only, never full script) |
| `javascript_global` | `globalName`                                            |
| `resource`          | `url` (not body content)                                |
| `link`              | `url` (resolved, not raw tag)                           |
| `html`              | `selector`, `snippet`                                   |

No evidence type stores oversized content. ✅ Invariant B satisfied
(every evidence has an explicit `type`).

### Current persistence model

- `detections` stored as `jsonb` in the `snapshots` table
  (`packages/database/src/schema.ts`)
- `PostgresScanResultRepository` and `InMemoryScanResultRepository`
  persist the full `Detection[]` including `technology`, `confidence`,
  and `evidence`
- `InMemoryScanResultRepository.getDetections()` allows retrieval for
  verification

### Current scoring model

- `ConfidenceScorer.score()` creates a **new** `Detection` with
  `evidence: [...detection.evidence]` — it never mutates the input
- Evidence is preserved through scoring ✅ (Invariants C, D)
- Same snapshot always produces the same result ✅ (Invariant E)

### Required changes

| Issue                      | Before (Step 8)                                              | After (Step 9)                                |
| -------------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| Evidence dedup key         | `JSON.stringify(evidence)` (fragile to property order)       | `getEvidenceKey(evidence)` (explicit, stable) |
| Evidence ordering          | First-appearance order (depends on detector/signature order) | Canonical sort by `(type, canonical key)`     |
| Evidence identity function | None                                                         | `getEvidenceKey(evidence: Evidence): string`  |
| Evidence quality tests     | Evidence size checks only                                    | Full invariant tests (A–H)                    |

## Evidence Model

The existing `Evidence` model was confirmed as well-structured and
machine-readable. No changes to the model were needed. All evidence
variants are serializable as JSON (plain objects with string/number
fields).

## Evidence Canonicalization

Created `packages/detectors/src/evidence-key.ts` with:

```typescript
export function getEvidenceKey(evidence: Evidence): string {
  switch (evidence.type) {
    case 'http_header':
      return `http_header|${evidence.name}|${evidence.value}`;
    case 'meta_tag':
      return `meta_tag|${evidence.name}|${evidence.content}`;
    case 'script_url':
      return `script_url|${normalizeUrl(evidence.url)}`;
    case 'script_content':
      return `script_content|${evidence.snippet}`;
    case 'javascript_global':
      return `javascript_global|${evidence.globalName}`;
    case 'resource':
      return `resource|${normalizeUrl(evidence.url)}`;
    case 'link':
      return `link|${normalizeUrl(evidence.url)}`;
    case 'html':
      return `html|${evidence.selector}|${evidence.snippet}`;
  }
}
```

**Design decisions:**

- URL fields are normalized to lowercase (hostname case-insensitivity)
- Other fields are exact-matched (conservative — no normalization)
- Format: `type|field1|field2|...` — stable, human-readable
- NOT exported from `index.ts` (internal to `@devlens/detectors`)

## Deduplication

`DeduplicatingDetector.mergeEvidence()` now uses `getEvidenceKey` instead
of `JSON.stringify`. The same function is used in `ResourceDetector` and
`LinkDetector` for their intra-detector evidence deduplication.

Before:

```typescript
const key = JSON.stringify(evidence); // fragile to property order
```

After:

```typescript
const key = getEvidenceKey(evidence); // stable, type-aware
```

Test: `evidence-quality.test.ts` — Scenario B verifies that duplicate
evidence across different detection groups is removed.

## Determinism

After deduplication, evidence is **sorted by canonical key** in
`DeduplicatingDetector.mergeEvidence()`:

```typescript
merged.sort((a, b) => {
  const keyA = getEvidenceKey(a);
  const keyB = getEvidenceKey(b);
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
});
```

This ensures that `[meta_tag, script_url]` and `[script_url, meta_tag]`
both produce `[meta_tag, script_content, script_url]` (sorted order).
Test: `evidence-quality.test.ts` — Scenario D verifies that `[A, B]` and
`[B, A]` produce the same canonical output.

## Persistence

The `detections` column in the `snapshots` table is `jsonb`. JSON
serialization/deserialization is lossless for the `Detection` type:

- `Technology` object (id, name, category) — preserved
- `confidence` number — preserved
- `Evidence[]` — each item retains its `type` discriminant and all fields
  (URL fields become plain strings after JSON round-trip; the `Url` brand
  is a compile-time only concept)

Test: `evidence-persistence.test.ts` — 4 tests verify full application-
layer round-trip via `executeScan` → `InMemoryScanResultRepository` →
`getDetections`, plus JSON serialization with type discriminant
preservation.

## Tests Added

| File                           | Tests | Coverage                                                                                         |
| ------------------------------ | ----- | ------------------------------------------------------------------------------------------------ |
| `evidence-key.test.ts`         | 15    | Canonical key generation, URL normalization, property-order independence                         |
| `evidence-quality.test.ts`     | 19    | Invariants A–H (presence, dedup, distinct, ordering, scoring preservation, multi-detector, JSON) |
| `evidence-integration.test.ts` | 10    | Scenarios A–E (Next.js, WordPress, no-fingerprint, noise, JSON persistence)                      |
| `evidence-persistence.test.ts` | 4     | Full round-trip via `executeScan`, JSON serialization, API response shape                        |

**Total: 48 new tests**

### Invariants tested

| Invariant | Description                             | Test                                                      |
| --------- | --------------------------------------- | --------------------------------------------------------- |
| A         | Every detection has ≥1 evidence         | `evidence-quality.test.ts` — "A — Evidence presence"      |
| B         | Every evidence has an explicit type     | `evidence-quality.test.ts` — "A" + "H"                    |
| C         | Evidence preserved through scoring      | `evidence-quality.test.ts` — "E — Scoring preservation"   |
| D         | Scoring doesn't modify evidence content | `evidence-quality.test.ts` — "E"                          |
| E         | Same snapshot → same detection          | `evidence-quality.test.ts` — "D — Deterministic ordering" |

### Integration scenarios

| Scenario           | What it verifies                                                      | Files                                                           |
| ------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| A — Next.js        | Multi-source evidence, canonical sorting, no duplicate URLs           | `evidence-integration.test.ts`, `pipeline.integration.test.ts`  |
| B — WordPress      | 4 evidence sources (meta_tag, script_url, link, resource), all unique | `evidence-integration.test.ts`, `pipeline.integration.test.ts`  |
| C — No fingerprint | `detections = []` with no artifacts                                   | `evidence-integration.test.ts`, `pipeline.integration.test.ts`  |
| D — Noise          | No false positives from generic CSS/HTML/JS                           | `evidence-integration.test.ts`, `pipeline.integration.test.ts`  |
| E — Persistence    | JSON round-trip preserves evidence fields + type discriminant         | `evidence-persistence.test.ts`, `persistence-roundtrip.test.ts` |

## Files Changed

### Created

| File                                                  | Purpose                                      |
| ----------------------------------------------------- | -------------------------------------------- |
| `packages/detectors/src/evidence-key.ts`              | `getEvidenceKey()` canonicalization function |
| `packages/detectors/src/evidence-key.test.ts`         | 15 tests for canonical key generation        |
| `packages/detectors/src/evidence-quality.test.ts`     | 19 tests for evidence invariants A–H         |
| `packages/detectors/src/evidence-integration.test.ts` | 10 tests for integration scenarios A–E       |
| `packages/database/src/evidence-persistence.test.ts`  | 4 tests for evidence persistence round-trip  |
| `docs/Step9-report.md`                                | This report                                  |

### Modified

| File                                                    | Change                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/detectors/src/deduplicating-detector.ts`      | `mergeEvidence()` uses `getEvidenceKey` instead of `JSON.stringify`, adds canonical sort |
| `packages/detectors/src/resource-detector.ts`           | `selectBestAndMerge()` uses `getEvidenceKey` instead of `JSON.stringify`                 |
| `packages/detectors/src/link-detector.ts`               | `selectBestAndMerge()` uses `getEvidenceKey` instead of `JSON.stringify`                 |
| `packages/detectors/src/deduplicating-detector.test.ts` | Updated 3 tests for canonical evidence ordering (meta_tag < script_content < script_url) |
| `docs/architecture/detectors.md`                        | Added "Evidence Canonicalization & Explainability" section, updated File Structure       |

## Architectural Decisions

### ADR-9.1: `getEvidenceKey` is internal (not exported)

The function is only used within `@devlens/detectors` (by
`DeduplicatingDetector`, `ResourceDetector`, `LinkDetector`). Per Step 9
Section 13 ("any new public function must be intentional"), it is kept
internal — tests import it directly from `./evidence-key.js`.

### ADR-9.2: Canonical evidence sorting in DeduplicatingDetector

Evidence is sorted by `getEvidenceKey` (type, then content) after
deduplication. This makes evidence order independent of detector
ordering and provides a predictable, explainable presentation to API
consumers. The sort is stable and deterministic.

This is a **behavioral change**: evidence is no longer in first-appearance
order. The 3 affected tests in `deduplicating-detector.test.ts` were
updated to assert the new canonical order.

### ADR-9.3: URL normalization in canonical key

URLs are lowercased in `getEvidenceKey` so that case variants of the
same resource (e.g. `https://CDN.Example.COM/style.css` vs
`https://cdn.example.com/style.css`) are treated as identical evidence.
Non-URL fields (header names, meta tag names, content, snippets) are
NOT case-normalized — they are exact-matched for conservative behavior.

### ADR-9.4: No change to Evidence model

The existing `Evidence` discriminated union is already well-structured,
machine-readable, and serializable. No new evidence types were added.

### ADR-9.5: No change to Detection model

`Detection` remains `{ technology, confidence, evidence }`. The
`confidence` field is the final scored confidence (from Step 7). No
additional `score` field or explanation text was introduced — explainability
is a projection of existing data, not a new concept.

## Deferred Work

The following improvements are deliberately NOT implemented in Step 9:

1. **Evidence descriptions / human-readable explanations**: Adding
   human-readable text describing what each evidence item means (e.g.
   "WordPress detected because the page links to `/wp-content/`"). This
   would require either LLM-generated text (prohibited by constraints) or
   a manually-maintained description table per evidence type.

2. **Evidence grouping by technology**: Grouping evidence into
   categories (e.g. "HTTP headers", "HTML content") for presentation.
   This is a frontend concern and should not be implemented in the
   detectors layer.

3. **Confidence breakdown**: Exposing the scoring components (base
   confidence, bonus per source) as separate fields in the API response.
   This would change the API contract and is deferred pending frontend
   requirements.

4. **Evidence weighting**: Assigning different weights to different
   evidence types (e.g. a `script_url` match for `/_next/` might be
   weighted differently from a `meta_tag` match). This would change the
   `ConfidenceScorer` formula (from Step 7) and is explicitly prohibited
   by the constraints.

5. **Negative evidence tracking**: Recording evidence that was checked
   but did not match (e.g. "Vue not detected because `Vue.createApp` was
   not found"). This would significantly increase evidence payload size
   and is deferred.

## Validation

| Check                  | Result                                        |
| ---------------------- | --------------------------------------------- |
| `pnpm typecheck`       | ✅ 0 errors                                   |
| `pnpm test`            | ✅ 557 passed \| 9 skipped (566 total)        |
| `pnpm lint`            | ✅ All matched files use Prettier code style! |
| `pnpm build`           | ✅ all packages built, Next.js compiled       |
| `npx madge --circular` | ✅ No circular dependency found (93 files)    |
