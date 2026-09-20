# Step 67 — Detection Intelligence Foundation (Report)

Implementation of `docs/Step67.md`. Adds a first-class **optional `version`** to `Detection` and declarative, reusable signature version-extraction over the _existing_ HTTP/HTML/script observations. The version travels domain → detectors → persistence → API → UI with tests, while preserving all existing behavior.

**Baseline:** `5771d2a` (Step 65, GREEN) · **HEAD:** `24763be` (Step 66, committed separately).

## 1. Design

`version` is **optional, deterministic, and evidence-based** — it is extracted _only_ from evidence already attached to the detection. It never fabricates a value, never appends a `%` suffix, and the scorer is independent of version.

```
CompositeDetector[Header, Meta, ScriptUrl, ContentScript, Resource, Link]
  → DeduplicatingDetector   (selectVersion consensus)
  → ScoringDetector         (ConfidenceScorer — version pass-through, NOT a score factor)
```

Each detector attaches an optional `VersionRule` to a signature; `detect()` calls `extractVersion(<matched observable>, sig.version)` and passes the result to `createDetection`. `extractVersion` returns `null` on no-spec / no-match / validator-throw (never throws). The `jsonb` `detections` column stores version transparently — **no schema migration**.

### 2. The consensus (why not the representative)

`DeduplicatingDetector.deduplicate` does **not** take `representative.version`. The representative is the highest-confidence duplicate, but the highest-confidence signature does not always carry the version rule. E.g. for WordPress the highest-confidence signature is `ResourceDetector` CSS `--wp--preset--` (95, **no** version rule) while the version `6.4.2` lives on the **lower** confidence `MetaTagDetector` signature (90). Representative-only would drop it to `null`.

Instead a new `selectVersion(group)` computes consensus over the existing dedup group:

```ts
private selectVersion(group: Detection[]): TechnologyVersion | null {
  const distinct = new Set<string>();
  for (const detection of group) { if (detection.version) distinct.add(String(detection.version)); }
  if (distinct.size === 1) return Array.from(distinct)[0] as TechnologyVersion;
  return null;
}
// nulls ignored; agree → keep; disagree → null; none → null.
```

Deterministic and O(group) — no new precedence engine, no ordering dependence.

## 3. Signature version rules (Phase 4 subset)

| Detector  | Technology                | Rule                                    | Example → version                     |
| --------- | ------------------------- | --------------------------------------- | ------------------------------------- |
| Header    | nginx                     | `/nginx\/(\d+(?:\.\d+){0,2})/`          | `nginx/1.21.6 (Ubuntu)` → `1.21.6`    |
| Header    | apache                    | `/apache\/(\d+(?:\.\d+){0,2})/i`        | `Apache/2.4.41 (Ubuntu)` → `2.4.41`   |
| Header    | iis                       | `/microsoft-iis\/(\d+(?:\.\d+){0,2})/i` | `Microsoft-IIS/10.0` → `10.0`         |
| Header    | php                       | `/php\/(\d+(?:\.\d+){0,2})/i`           | `PHP/8.2.10` → `8.2.10`               |
| Header    | express / cloudflare      | _(none)_                                | → `null`                              |
| Meta      | WordPress                 | `/wordpress\s+(\d+(?:\.\d+){0,2})/i`    | `WordPress 6.4.2` → `6.4.2`           |
| Meta      | Hugo / Jekyll / Ghost / … | _(none)_                                | → `null`                              |
| ScriptUrl | jQuery                    | `/jquery-(\d+(?:\.\d+){0,2})/i`         | `jquery.min.js` (no version) → `null` |
| ScriptUrl | Lodash                    | `/lodash[-@/](\d+(?:\.\d+){0,2})/`      | `lodash@4.17.21` → `4.17.21`          |

### Why the lodash rule is `[-@]`

The canonical CDN URL is `https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js` (uses `@`). The original `/lodash\/…/` only matched the `lodash/4.17.21` shape — **not** the real CDN token — so it returned `null`. `/lodash[-@/](\d+(?:\.\d+){0,2})/` matches both `@4.17.21` and `/4.17.21`.

### Rejected: `%`-suffixed confidence / version-as-probability

`Confidence: 95` is rendered **without** `%`; `version` is rendered as `Version: 6.4.2` (no `%`). All `not.toContain('N%')` assertions remain intact.

## 4. Persistence (Phase 6/7)

`packages/database/src/schema.ts`: `detections: jsonb('detections').notNull()` is a whole blob — version is a normal property on each `Detection` object and is copied by `snapshotToRow` (`detections: [...detections]`) and `rowToSnapshot` (`detections: [...(row.detections as Detection[])]`). **No migration.**

Round-trip verified by `snapshot-mapping.test.ts`: a detection built with `createTechnologyVersion('1.21.6')` survives `snapshotToRow → rowToSnapshot` with `version === '1.21.6'`. Legacy rows (no `version` key) reconstruct cleanly — `version` is `undefined`, never fabricated.

## 5. API / web (Phase 8)

- `apps/web/src/app/api/scans/handler.ts` — `DetectionResponse.version?: string`; `detectionToResponse = (…, ...(detection.version ? { version: detection.version } : {}))` **omit-when-absent** (not `null`).
- `apps/web/src/lib/types.ts` — `DetectionResponse.version?: string`.
- `apps/web/src/lib/scan-detection-results.ts` — same omit-when-absent spread (`exactOptionalPropertyTypes`-safe; `version: detection.version` is rejected — see §6).
- `DetectionItem.tsx` — `const { technology, confidence, version } = detection; … {version ? <span>Version: {version}</span> : null}` after the `Confidence:` span.
- `ScanComparison.tsx` — `<span>Version: {fullDetection.version}</span>` guarded by `fullDetection?.version` (added/removed only).
- `ScanCard.module.css` — `.version { font-size: .8rem; color: #6b7280; font-weight: 400; }`.
- `apps/web/src/app/scans/[id]/page.tsx` and `technologies/[id]/page.tsx` — **not modified** (scan detail flows version via `DetectionList → DetectionItem` automatically; technology detail renders only scan-level summaries — out of scope).

## 6. Tests (Phase 9)

| File                                     | Added                                                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/detectors/src/version.test.ts` | 20 unit tests for `VersionRule`/`extractVersion` (literal & capture-group).                                                             |
| `header-detector.test.ts`                | 10 asserts: nginx/apache/iis/php versions + express/cloudflare `null`.                                                                  |
| `meta-tag-detector.test.ts`              | WordPress `6.4.2`/`6.4` + Hugo/Next.js/WordPress-no-version `null`.                                                                     |
| `script-url-detector.test.ts`            | jQuery `3.7.1` + Lodash `4.17.21` (`@`/`) + jQuery-min/Bootstrap/Next.js `null`.                                                        |
| `deduplicating-detector.test.ts`         | 6 consensus tests (representative-no-version-but-sibling-has → kept; conflict → null; none → null; determinism; ordering-independence). |
| `realworld-audit.test.ts`                | +4 full-pipeline asserts: WordPress `6.4.2`, PHP `8.2`, Cloudflare `null`, jQuery `null`.                                               |
| `apps/web/.../scans/route.test.ts`       | API serialize (`nginx 1.21.6` present) + omit (`cloudflare` absent key).                                                                |
| `DetectionItem.test.tsx`                 | present/absent/no-`%`/subordinate.                                                                                                      |
| `ScanComparison.test.tsx`                | added-with-version / added-without-version.                                                                                             |
| `snapshot-mapping.test.ts`               | round-trip + legacy forward-compat.                                                                                                     |

### One fix during testing

`version.test.ts` had an assertion using `/nginx\/\d+/` expecting `'nginx/1.21.6'` — that regex stops at the first `.`, matching only `nginx/1`. Corrected to `/nginx\/[\d.]+/` which greedily matches the whole `1.21.6` token → `'nginx/1.21.6'`. This was a test-regex error, **not** a production bug.

## 7. §Step11 Self-audit (answers)

1. **Is `version` evidence-based?** Yes — extracted only from observables already attached (`matchedValue`, header `value`, meta `content`, script `url`). No out-of-band lookups.
2. **Is it deterministic?** Yes — `extractVersion` is a pure regex on stable input; `selectVersion` is a `Set`-based consensus over the sorted dedup group. Output is invariant under group ordering (asserted).
3. **Is it fabricated?** Never. No-spec → `null`; no-match → `null`; `createTechnologyVersion` throw → caught → `null`. Absent in the DTO when `null` (omit-when-absent), never `null`.
4. **Does the scorer read `version`?** No — `ConfidenceScorer.score()` returns `{ …detection, version: detection.version ?? null }`. Version is pass-through, independent of the `confidence DESC, technology.id ASC` ranking and the `min(100, round(base + min(10,(n_types−1)·5)))` score.
5. **Conflict handling?** `selectVersion`: agree → keep; disagree → `null`; none → `null` (conservative).
6. **API contract?** Omit-when-absent spread (exact-optional-types-safe). Two API tests assert `version === '1.21.6'` (present) and `'version' in detection === false` (absent).
7. **Schema migration?** None. `jsonb` stores the whole `Detection[]`; version round-trips verbatim; legacy rows forward-compatible.
8. **Existing behavior preserved?** `golden-fixtures` (184), `pipeline.integration` (determinism), `production-detector` (`toEqual` both `1.21.6`), `realworld-audit` rankings, `confidence`/`scoring`/`ranking` asserts all green — none assert a full-Detection `toEqual`, so adding an optional `version?` field cannot weaken existing IDs/ranks/evidence. No `%`-suffix regressions (all `not.toContain('N%')` intact).

## 8. Environment notes

- Working shell: PowerShell (`shell: powershell`). `pnpm` shim only resolves under PowerShell; WSL/bash cannot see it.
- Chaining uses `;` (PowerShell rejects `&&`/`||`); no bare `curl` (alias to `Invoke-WebRequest`) — `curl.exe` only; no GNU `grep`/`find` — `Select-String`/`Get-ChildItem`.
- `@devlens/core` resolves via `exports → dist/index.d.ts`, so `pnpm --filter @devlens/core build; pnpm --filter @devlens/detectors build` must precede `tsc --noEmit` (detectors consume core's built declarations, not source).

## 9. Verification

Final gate (all green): `pnpm typecheck` → `eslint .` → `prettier --check .` → `pnpm exec vitest run` (1766 baseline + 18 skipped + new) → `pnpm build`. `postgres-repository.test.ts` stays skipped (`DATABASE_URL` unset); `snapshot-mapping.test.ts` stays always-on.
