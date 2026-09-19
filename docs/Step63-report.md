# Step 63: Scan Data Integrity & Detection Reliability — AUDIT & FIX

## Executive summary / verdict

Two **genuine, test-confirmed defects** were found and fixed. Both are
data-integrity issues that caused silent evidence/data loss:

- **Bug A — Evidence identity divergence (web vs detector layer).**
  The web layer's `getEvidenceIdentity` omitted `value`/`content`/`snippet`
  and did not lowercase URL fields, while the canonical detector-layer
  `getEvidenceKey` includes them. Result: the web layer's
  `deduplicateEvidence` silently dropped evidence the detector layer
  intentionally kept distinct (e.g. two different `Server` header values
  collapsed to one). Four tests in `evidence-identity-attack.test.ts`
  failed. **Fixed** by aligning `getEvidenceIdentity` with the canonical
  rules; conflicting assertions updated; regression tests now pass.

- **Bug B — PostgreSQL persistence drops `html.links`.**
  The `snapshots` table had no `html_links` column, `snapshotToRow` never
  wrote links, and `rowToSnapshot` hard-coded `links: []` on read-back.
  The round-trip invariant (read-back snapshot == written snapshot) was
  violated for links. **Fixed** by adding the column + migration,
  persisting and reconstructing links in the mappers, and adding an
  always-on regression test.

**No defects** were found in: scoring (base/bonus/cap/NaN/Infinity/clamp),
determinism (fixed sub-detector order, getEvidenceKey sort, confidence
DESC + tech.id ASC tie-break), API serialization (the `snapshot` field
trim in the API response is a deliberate summary contract; detections
carry all evidence faithfully), target normalization (target is
normalized once at scan creation via `new URL().href` and reused
consistently across crawler/persistence/history/re-scan), or failure
semantics (failed scan → HTTP 200 with `status:"failed"`, `snapshot:null`,
`detections:[]`, structured `error`; persistence failure → HTTP 500 with
no detail leakage — no Step-62-style contradiction).

---

## Investigation method

- **Source-level trace** of the full data path: `packages/crawler` →
  `packages/core` domain types → `packages/detectors` (Composite →
  Deduplicating → Scoring) → `packages/application` (`runScan`/`executeScan`)
  → `packages/database` persistence → `apps/web` API + presentation.
- **Test execution** via `pnpm exec vitest run` for every package and
  `apps/web`.
- **Round-trip reasoning**: for each stage, compared BEFORE (written)
  vs AFTER (read-back) semantics.

---

## Phase-by-phase findings

### Phase 1 — Data integrity invariants

Defined for `Scan` (single terminal status, completed⇔snapshot present,
failed⇔snapshot null), `Detection` (confidence ∈ [0,100] finite,
evidence non-empty, technology identity stable), `Evidence` (canonical
identity includes all distinguishing fields), `Ranking` (deterministic
tie-break by `technology.id` ASC).

### Phase 2 — Deduplication attack (CONFIRMED BUG A)

The detector layer (`packages/detectors/src/evidence-key.ts`) defines the
canonical identity:

```text
http_header|name|value      meta_tag|name|content
html|selector|snippet       script_url|normalizeUrl(url)
resource|normalizeUrl(url)  link|normalizeUrl(url)
script_content|snippet      javascript_global|globalName
```

i.e. **all distinguishing fields** + **URLs lowercased**. The
`DeduplicatingDetector` already uses this key, so the detector layer
**correctly** keeps `Server: nginx` and `Server: Apache` as distinct
evidence (the `deduplication-attack.test.ts` scaffolding confirms this).

The web layer (`apps/web/src/lib/evidence-identity.ts`) used a weaker
identity (`http_header:{name}`, `meta_tag:{name}`, `html:{selector}`)
that **omitted** value/content/snippet and did **not** lowercase URLs.
`deduplicateEvidence` therefore collapsed distinct evidence into one,
causing silent data loss in the rendered UI. The web layer's
`getScanDetectionResults` and `getDetectionExplainability` both delegate
to this identity, so the loss propagated to the presentation layer.

`evidence-identity-attack.test.ts` asserted the corrected behavior
(keep both, length 2) and **failed (4 tests)** before the fix.

### Phase 3 — Scoring attack (no defect)

Verified the scorer in `packages/detectors/src/detection-scorer.ts`:

- `base = detection.confidence`; `bonus = min(10, max(0, (n_unique_types-1))*5)`;
  `score = clamp(round(base+bonus), 0, 100)`.
- `clampConfidence` maps `NaN→0`, `Infinity→100`, clamps to [0,100].
- `createConfidence` rejects non-finite / out-of-range at the factory.
- Scoring runs **after** dedup, so duplicate evidence never inflates.
- Tie-break: technology.id ASC (deterministic).
- `scoring-attack.test.ts` + `scoring-detector.test.ts` all pass.

### Phase 4 — Persistence round-trip (CONFIRMED BUG B)

InMemory repo: correct (stores the whole object by reference; links
survive).

Postgres repo (`packages/database/src/postgres-repository.ts`):

- `schema.ts` `snapshots` table had `htmlMetaTags`, `htmlScripts`,
  `headers`, `resources`, `detections` but **no `html_links` column**.
- `snapshotToRow` never wrote links.
- `rowToSnapshot` hard-coded `links: []` (comment: "links were not
  persisted by the write-side mapper; return empty").

The existing `postgres-repository.test.ts` round-trip used `links: []`
in its fixture, so it masked the bug. **Fix** (see below) makes read-back
faithful.

### Phase 5 — API serialization (no defect)

`handler.ts` `resultToResponse` returns a deliberate **summary** snapshot
(`{ url, hostname, capturedAt, http{statusCode,contentType,finalUrl},
html{title,description} }`) — this is the documented contract, not data
loss: all evidence is carried via `detections`, and the full snapshot
(links etc.) is persisted in the DB. `types.ts` (`SnapshotResponse`)
matches the handler exactly. No divergence.

### Phase 6 — Target normalization (no defect)

- Scan creation (`route.ts`): `new URL(rawUrl).href` normalizes host
  casing + adds a trailing slash; `hostname` derived from the same.
- Crawler receives this normalized `target.url`.
- `scan-history.ts` uses exact `scan.target` string identity (intentional
  per Step 57). Since the target is normalized once at creation and
  stored, all downstream consumers (history, re-scan link, comparison)
  operate on the same normalized string.
- `snapshot.url` may differ from `scan.target` after redirects — this is
  documented, not a bug. No inconsistency found.

### Phase 7 — Failure semantics (no defect)

Traced all cases against `packages/application/src/orchestrator.ts` +
`apps/web/src/app/api/scans/handler.ts` + the `[id]` detail page:

- Invalid URL → 400 (`INVALID_URL` / `MISSING_URL` / `UNSUPPORTED_PROTOCOL`).
- Crawler `CrawlError` → 200 with `status:"failed"`, `snapshot:null`,
  `detections:[]`, `scan.error:{code,message}` — **not** 500.
- Generic crawler error → 200 `failed` with `code:"UNKNOWN_ERROR"` + message.
- Persistence failure → 500 `INTERNAL_ERROR`, no detail leakage.
- The detail page renders failed scans via `ScanLifecycle` (not a 404),
  shows `· 0 detections` for terminal+failed, and exposes a Re-scan link
  using the (normalized) `scan.target`. No contradictory "completed
  successfully" signal remains (that was the Step-62 defect).

> Note: the SSRF guard (`isIPv6UniqueLocal`) returns false for
> bracketed IPv6 unique-local addresses (e.g. `[fc00::1]`) — a known,
> documented limitation in `packages/crawler/src/ssrf-guard.ts`. It is
> a security-hardening gap, **not** a data-integrity defect, so it is out
> of scope for this step and was left unchanged.

### Phase 8 — Determinism (no defect)

`CompositeDetector` has a fixed sub-detector order; `DeduplicatingDetector`
preserves first-appearance order and sorts evidence by `getEvidenceKey`;
`ScoringDetector.#rank` sorts by confidence DESC then `technology.id` ASC.
`deduplication-attack.test.ts` "output order is independent of input
detection order" and `determinism-persistence.test.ts` confirm identical
output across input orderings. The web layer's
`getScanDetectionResults` ordering (confidence DESC → name ASC → id ASC)
is also deterministic. No defect.

---

## Fixes applied

### Fix A — Canonical evidence identity (web layer)

`apps/web/src/lib/evidence-identity.ts` — `getEvidenceIdentity` now:

- `http_header` → `http_header:{name}|{value}`
- `meta_tag` → `meta_tag:{name}|{content}`
- `html` → `html:{selector}|{snippet}`
- `script_url` / `resource` / `link` → URL **lowercased** (`normalizeUrl`)
- `script_content` / `javascript_global` → unchanged
- unknown → unchanged

This makes the web layer's distinguishability exactly match the canonical
`getEvidenceKey`. Added a `normalizeUrl` helper (mirrors the detector
package's private `normalizeUrl`). No new cross-module dependencies were
introduced (the web layer stays decoupled from `@devlens/detectors`, as
its doc comments require).

`apps/web/src/lib/comparison.ts` — updated the stale doc comment that
claimed the web identity was "a presentation-level identity, not a
detector-level one."

### Fix B — PostgreSQL `html.links` round-trip

- `packages/database/src/schema.ts` — added
  `htmlLinks: jsonb('html_links').notNull()` to the `snapshots` table.
- `packages/database/src/postgres-repository.ts`:
  - imported `LinkTag`; added `htmlLinks: LinkTag[]` to `SnapshotRow`.
  - `snapshotToRow` now writes `htmlLinks: [...snapshot.html.links]`.
  - `rowToSnapshot` now reconstructs `links` from `row.htmlLinks`
    (replacing the hard-coded `links: []`).
  - added `htmlLinks` to the upsert `set` object.
  - **exported** `snapshotToRow` and `rowToSnapshot` so they can be
    unit-tested without a database.
- `packages/database/drizzle/0004_add_links_to_snapshots.sql` — new
  migration `ALTER TABLE snapshots ADD COLUMN html_links jsonb
NOT NULL DEFAULT '[]'::jsonb;` (same pattern as `0003_*`).

### Tests added / updated

- `apps/web/src/lib/evidence-identity-attack.test.ts` — the "SAME identity
  (BUG)" assertions flipped to "DIFFERENT identities (FIXED)" (`not.toBe`);
  the "DATA LOSS" assertions (length 2) now pass.
- `apps/web/src/lib/evidence-identity.test.ts` — updated the "does NOT
  affect identity" tests to reflect value/content/snippet-aware identity;
  updated format-string assertions; updated the two name-only dedup tests
  to assert both distinct items are kept.
- `apps/web/src/lib/detection-explainability.test.ts` — updated
  dedup-count, ordering, and regex assertions to the value-aware identity.
- `apps/web/src/lib/comparison.test.ts` — the `compareScans` evidence
  test now expects 2 evidence changes (distinct identities).
- `apps/web/src/components/DetectionItem.test.tsx` — the rendered
  deduplicated-evidence test now expects "2 evidence items" and asserts
  both `Server: nginx` / `Server: Apache` survive (regression guard
  against UI-level evidence loss).
- `packages/detectors/src/evidence-key.test.ts` — added a
  "canonical identity invariants (web layer mirrors these)" block pinning
  the source-of-truth behavior (same-name/different-value → different key;
  URL case-insensitivity).
- `packages/database/src/snapshot-mapping.test.ts` (NEW) — always-on
  round-trip test of the postgres mappers asserting `html.links`
  survives write→read, plus full snapshot + detections lossless round-trip
  and the null-row case.
- `packages/database/src/postgres-repository.test.ts` — added a link to
  the `makeSnapshot` fixture and an explicit `htmlLinks` read-back
  assertion so the DB-backed round-trip (runs with `DATABASE_URL`) also
  covers links.

---

## Validation

| Gate                                                                      | Result                                                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run` (full monorepo)                                    | **99 test files / 1758 tests passed** (2 skipped files / 18 skipped tests — DB + integration suites) |
| `pnpm exec vitest run apps/web/src` (was 4 failing)                       | **816 passed**, 2 skipped — the 4 pre-existing failures are resolved                                 |
| `pnpm exec vitest run packages/detectors packages/database packages/core` | **737 passed**, 16 skipped                                                                           |
| `pnpm typecheck` (`tsc --noEmit` across 11 workspace projects)            | **All pass**                                                                                         |
| `pnpm exec eslint .`                                                      | **Clean** (no errors/warnings)                                                                       |
| `pnpm exec prettier --check` (all Step 63-changed files)                  | **All clean**                                                                                        |
| Next.js production build (`pnpm -r build`)                                | see build output below                                                                               |
| madge (circular deps)                                                     | see note below                                                                                       |

Environment constraints:

- **No PostgreSQL** is available in this environment, so the
  `postgres-repository.test.ts` integration suite is skipped (by the
  existing `describe.skip` guard). The postgres mapper round-trip is
  instead covered by the **always-on** `snapshot-mapping.test.ts`, which
  exercises the exact write→read path without a database.
- **madge is not a project dependency** (`pnpm list madge` → not found,
  not in `package.json`). Manual review confirms the changes introduce no
  new import edges that could form a cycle: `evidence-identity.ts`
  imports only `./types.js`; `comparison.ts` and `postgres-repository.ts`
  add no new module imports (only a type-only `LinkTag` to the
  already-imported `@devlens/core`); `schema.ts` adds no imports.

---

## Scope discipline (what was NOT changed)

- Did **not** redesign or restructure any detector (per constraints).
- Did **not** change the canonical `getEvidenceKey` algorithm (it was
  correct; only the web layer was aligned to it).
- Did **not** change the API response `snapshot` summary contract (it is
  intentional; evidence lives in `detections`).
- Did **not** alter target-normalization semantics (normalized once at
  creation; correct).
- Did **not** mass-reformat the pre-existing `docs/*.md` files, which
  already had Prettier drift before this step (46 tracked doc files are
  flagged by `prettier --check .` but are unrelated to Step 63 and out
  of scope). All Step 63-changed files are Prettier-clean.

---

## Files changed

Source:

- `apps/web/src/lib/evidence-identity.ts` (Fix A)
- `apps/web/src/lib/comparison.ts` (doc comment)
- `packages/database/src/schema.ts` (Fix B — `html_links` column)
- `packages/database/src/postgres-repository.ts` (Fix B — persist/reconstruct links; exported mappers)

Tests:

- `apps/web/src/lib/evidence-identity.test.ts`
- `apps/web/src/lib/evidence-identity-attack.test.ts`
- `apps/web/src/lib/detection-explainability.test.ts`
- `apps/web/src/lib/comparison.test.ts`
- `apps/web/src/components/DetectionItem.test.tsx`
- `packages/detectors/src/evidence-key.test.ts`
- `packages/detectors/src/deduplication-attack.test.ts` (Prettier cleanup of pre-existing unused vars)
- `packages/database/src/snapshot-mapping.test.ts` (new)
- `packages/database/src/postgres-repository.test.ts`

Migrations / infra:

- `packages/database/drizzle/0004_add_links_to_snapshots.sql` (new)

Docs:

- `docs/Step63-report.md` (this file)
