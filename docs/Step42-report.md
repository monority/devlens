# Step 42: Canonical Evidence Identity

## Status

`COMPLETE`

## Audit

Five implementations of the evidence identity algorithm were found across the codebase:

| #  | Module                        | Function          | Visibility        | Default case                              |
| -- | ----------------------------- | ----------------- | ----------------- | ----------------------------------------- |
| 1  | `lib/scan-insights.ts`        | `evidenceIdentity` | private           | `{type}:{JSON.stringify(item)}`           |
| 2  | `lib/scan-detection-results.ts` | `evidenceKey`   | internal          | `{type}:{JSON.stringify(item)}`           |
| 3  | `lib/detection-explainability.ts` | `evidenceIdentity` | private      | `{type}:{JSON.stringify(item)}`           |
| 4  | `lib/detection-coverage.ts`   | `evidenceKey`     | private           | `{type}:{JSON.stringify(item)}`           |
| 5  | `lib/comparison.ts`           | `evidenceKey`     | **exported**      | `unknown:{JSON.stringify(item)}`          |

All four private/internal implementations are identical in behavior for known evidence types and use the same default case (`{type}:{JSON.stringify(item)}`).

The fifth implementation (`comparison.ts`) has an inconsistent default case: it uses `unknown:` as the prefix instead of the actual evidence type. No tests or consumers depended on this specific `unknown:` prefix.

### Canonical semantics

All 8 known evidence types produce identical identities across every implementation:

| Evidence type      | Identity format                  | Key field       |
| ------------------ | -------------------------------- | --------------- |
| `html`             | `html:{selector}`               | `selector`      |
| `http_header`      | `http_header:{name}`            | `name`         |
| `meta_tag`         | `meta_tag:{name}`               | `name`         |
| `script_url`       | `script_url:{url}`              | `url`          |
| `script_content`   | `script_content:{snippet}`      | `snippet`      |
| `javascript_global` | `javascript_global:{globalName}` | `globalName`  |
| `resource`         | `resource:{url}`                | `url`          |
| `link`             | `link:{url}`                    | `url`          |

Unknown evidence types fall back to `{type}:{JSON.stringify(item)}`.

## Canonical implementation

**File:** `apps/web/src/lib/evidence-identity.ts`

**Exported function:** `getEvidenceIdentity(item: EvidenceResponse): string`

**Also exported:** `deduplicateEvidence(evidence: readonly EvidenceResponse[]): EvidenceResponse[]`

The module is pure (no React, HTTP, DB, network), deterministic, and does not mutate input.

### Exact consumers

After the refactor, all five consumer modules import the canonical implementation:

| Consumer module                  | Imports from `evidence-identity.ts`         |
| -------------------------------- | ------------------------------------------- |
| `lib/scan-insights.ts`           | `deduplicateEvidence`                       |
| `lib/scan-detection-results.ts`  | `getEvidenceIdentity`, `deduplicateEvidence` |
| `lib/detection-explainability.ts`| `getEvidenceIdentity`, `deduplicateEvidence` |
| `lib/detection-coverage.ts`      | `deduplicateEvidence`                       |
| `lib/comparison.ts`              | `getEvidenceIdentity` (imported, re-exported as `evidenceKey` for backward compatibility) |

## Refactored consumers

| Module                       | Change                                                                 |
| ---------------------------- | ---------------------------------------------------------------------- |
| `lib/evidence-identity.ts`   | **Created** — canonical `getEvidenceIdentity` + `deduplicateEvidence`   |
| `lib/evidence-identity.test.ts` | **Created** — 31 tests (authoritative identity suite)                |
| `lib/scan-insights.ts`       | Removed local `evidenceIdentity` + `deduplicateEvidence`; imports canonical |
| `lib/scan-detection-results.ts` | Removed local `evidenceKey` + `deduplicateEvidence`; imports canonical |
| `lib/detection-explainability.ts` | Removed local `evidenceIdentity` + `deduplicateEvidence`; imports canonical |
| `lib/detection-coverage.ts`  | Removed local `evidenceKey` + `deduplicateEvidence`; imports canonical   |
| `lib/comparison.ts`          | Replaced local `evidenceKey` implementation with import of `getEvidenceIdentity`; re-exported as `evidenceKey` for backward compatibility |
| `lib/comparison.test.ts`     | Updated `evidenceKey` tests: now verifies canonical identity equivalence + compareScans deduplication regression |

## Behavioral preservation

### Before/after identity output (identical for all known types):

| Evidence                              | Before (all 5) | After (canonical) |
| ------------------------------------- | -------------- | ----------------- |
| `{ type: 'http_header', name: 'Server' }` | `http_header:Server` | `http_header:Server` |
| `{ type: 'html', selector: '#app' }`  | `html:#app`    | `html:#app`       |
| `{ type: 'script_url', url: '...' }` | `script_url:...` | `script_url:...` |
| Unknown type                          | `unknown:{JSON}` (comparison.ts only) / `{type}:{JSON}` (others) | `{type}:{JSON}` (canonical) |

### Changes verified:

- **Deduplication** — identical: same Set-based first-occurrence algorithm
- **Ordering** — identical: sort by type label ASC → identity ASC
- **Evidence counts** — identical (same deduplicated counts in all consumers)
- **Coverage metrics** — identical (same evidenceCount, evidenceTypeCount, evidenceTypes)
- **Scan Detail rendering** — identical (same evidence displayed in EvidenceList)
- **Comparison** — identical (same `compareScans` evidence matching behavior)
- **Confidence** — unchanged (no scoring modification)

### Default case change:

The `comparison.ts` default case changed from `unknown:${JSON.stringify(item)}` to `${item.type}:${JSON.stringify(item)}`. This is the behavior already used by all other 4 implementations. No tests or consumers depended on the `unknown:` prefix. The `comparison.test.ts` was updated to test canonical identity equivalence.

## Architecture

```text
                    ┌────────────────────────────────┐
                    │  lib/evidence-identity.ts      │
                    │  (ONE canonical implementation) │
                    │  - getEvidenceIdentity()        │
                    │  - deduplicateEvidence()        │
                    └────────────────────────────────┘
                                      ▲
                    ┌─────────────────┼──────────────┐
         ┌──────────────┐  ┌─────────┴──────────┐
         │ scan-insights.ts │ │ scan-detection-results.ts │
         └──────────────┘  └─────────┬──────────┘
                    ┌──────────────┬─┘
         ┌────────┴────────┐ ┌──┴──────────────┐
         │ detection-     │ │ detection-      │
         │ explainability.ts │ │ coverage.ts     │
         └─────────────────┘ └─────────────────┘
                    ▲
         ┌──────────┴─────────┐
         │ comparison.ts      │
         │ (re-exports as     │
         │  evidenceKey)      │
         └────────────────────┘
```

## Tests

### New / updated test suites

| Test file                          | Tests | Description                                      |
| ---------------------------------- | ----- | ------------------------------------------------ |
| `lib/evidence-identity.test.ts`    | 31    | **Authoritative** — identity format, determinism, dedup, null/missing handling, cross-type collision, normalization |
| `lib/comparison.test.ts`           | 2 updated | Replaced inline evidenceKey tests with canonical identity equivalence + compareScans dedup regression |
| `lib/detection-explainability.test.ts` | 15 | Unchanged — existing tests verify canonical identity usage |
| `lib/detection-coverage.test.ts`   | 13   | Unchanged — existing tests verify dedup behavior |
| `lib/scan-insights.test.ts`        | 40    | Unchanged — existing tests verify dedup behavior |
| `lib/scan-detection-results.test.ts` | 14  | Unchanged — existing tests verify dedup + sorting |

### Authoritative test suite (`evidence-identity.test.ts`) — 31 tests:

1. Identical evidence → identical identity
2. Different header names → different identity
3. Header value does NOT affect identity (name is key)
4. Meta tag: name affects, content does not
5. Script URL depends on URL
6. Script content depends on snippet
7. HTML depends on selector
8. HTML snippet does NOT affect identity
9. JS global depends on globalName
10. Resource depends on URL
11. Link depends on URL
12. `html:{selector}` format
13. `http_header:{name}` format
14. `script_url:{url}` format
15. `script_content:{snippet}` format
16. `meta_tag:{name}` format
17. `javascript_global:{globalName}` format
18. `resource:{url}` format
19. `link:{url}` format
20. Unknown type fallback to `{type}:{JSON}`
21. Different types never collide
22. All 8 types distinguishable
23. Determinism (same input → same output)
24. No mutation of input
25. Exact duplicate removal
26. Semantic duplicate removal (same identity, different values)
27. First-occurrence preservation
28. Order preservation for distinct evidence
29. Zero evidence handling
30. All 8 types without collision
31. No mutation of input array (dedup)

### Final test totals

- **Step 41 baseline: 1501 passed, 18 skipped (83 files)**
- **Step 42 final: 1532 passed, 18 skipped (84 files)**
- **Increase: 31 new tests** (all from `evidence-identity.test.ts`)
- Files with tests: 84 (was 83)

## Validation

| Check          | Status | Details                          |
| -------------- | ------ | -------------------------------- |
| Typecheck      | ✅      | 0 errors                        |
| Tests          | ✅      | 1532 passed, 18 skipped (84 files) |
| ESLint         | ✅      | 0 errors                        |
| Prettier       | ✅      | All `.ts`/`.tsx` files formatted (12 pre-existing `.md` warnings unchanged) |
| Build          | ✅      | `next build` compiled successfully |
| Circular deps  | ✅      | No cycles                       |
| `jsx: "preserve"` | ✅   | Intact                         |

### Prettier note

The `pnpm lint` script runs both `eslint . && prettier --check .`. The `prettier --check .` command reports 12 warnings on pre-existing `.md` files in `docs/` (Steps 36–42). These are documentation files, not source code, and the warnings are pre-existing (not introduced by this step). All source code files (`*.ts`, `*.tsx`) pass Prettier formatting.

## Regression verification

- ✅ ScanOverview metrics (unchanged)
- ✅ ScanInsights evidence deduplication (unchanged — same `deduplicateEvidence` behavior)
- ✅ DetectionCoverage evidence deduplication (unchanged — same `deduplicateEvidence` behavior)
- ✅ DetectionExplainability evidence deduplication + sorting (unchanged)
- ✅ DetectionResults evidence deduplication + sorting (unchanged)
- ✅ Scan Detection Results rendering (unchanged)
- ✅ Scan Detail rendering (unchanged)
- ✅ Scan comparison (unchanged — `compareScans` still uses canonical identity via re-exported `evidenceKey`)
- ✅ Existing evidenceIdentity semantics (unchanged)
- ✅ Existing confidence values (unchanged)
- ✅ Detector pipeline (unchanged)
- ✅ No new dependencies (unchanged)

## Non-Goals (explicitly NOT done)

- No new evidence identity algorithm (reuses the exact algorithm from Steps 38–41)
- No confidence recalculation
- No detection algorithm changes
- No new evidence types
- No API contract changes
- No persistence changes
- No new dependencies
- No new framework, class, or DI container
- No generic "EvidenceService" or "EvidenceManager"
- No behavior change — pure extraction/refactor
- Did not rename `evidenceKey` to `getEvidenceIdentity` in public API surface (re-exported for backward compatibility)

## Git

Commit hash: `Step 42: Canonical Evidence Identity` (not yet committed)
Push: Blocked (no GitHub credentials available)
