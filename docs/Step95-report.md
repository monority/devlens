# Step 95 — Hardening Report

## Baseline

All commands run before any modification (after Step 94 commit `f536a20`):

| Check | Result | Details |
|-------|--------|---------|
| `git status` | ✅ Clean | HEAD `f536a20`, no working-tree changes (only pre-existing untracked docs) |
| `pnpm typecheck` | ✅ PASS | Exit 0, all workspace projects |
| `pnpm exec vitest run` | ✅ PASS | **2505 passed**, 18 skipped, 2 skipped files |
| `pnpm build` | ✅ PASS | Next.js 15.5.26, 9 routes |
| `pnpm exec eslint .` | ✅ PASS | 0 errors |
| `pnpm exec prettier --check .` | ✅ PASS | All matched files use Prettier code style! |
| `pnpm audit --audit-level=high` | ✅ PASS | 1 Moderate (esbuild), 0 High/Critical, exit 0 |

---

## Findings audited

| Finding | Evidence | Decision | Action |
|---|---|---|---|
| **1A — esbuild vulnerability** | `esbuild@0.18.20` via `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils@3.3.2 → esbuild@~0.18.20`. Both `@esbuild-kit/*` packages are at latest version (2.6.5 / 3.3.2) and pin `esbuild: ~0.18.20`. Drizzle cannot be upgraded per Step 95 constraints. Vulnerability is Moderate (dev-only, not exploitable via ESM loader's `transform`/`build` path — the dev-server `serve()` vuln is not used). | **DEFER** | No override added — below CI `--audit-level=high` threshold, not exploitable through current code path |
| **F-005 — Stub packages** | `packages/analyzer`, `packages/validation`, `packages/config` each contain only `export {};` with JSDoc. Searched entire codebase: NO imports/references in production code, tests, CI, tsconfig, or package.json. README (Step 94) explicitly documents them as "reserved stubs." | **KEEP** | They are intentional architecture placeholders with clear purpose documentation |
| **F-006 — No Playwright E2E** | `playwright.config.ts` exists (points to `testDir: 'e2e'` but no `e2e/` directory exists). `@playwright/test` + `playwright` installed as devDeps. No Playwright step in CI. Existing `route.integration.test.ts` (vitest) already covers API routes. | **DEFER** | Smoke test would require server lifecycle management (start dev server, manage ports, install browser binaries) with no signal gain over existing integration tests |
| **F-008 — Worker one-shot** | `apps/worker/src/main.ts:42` — `DEMO_TARGET_URL = 'https://example.com'` is explicitly documented as intentional ("intentionally hard-coded, not environment-driven, to keep the worker deterministic and explicit"). Worker is a thin composition root: creates demo scan → constructs HttpCrawler → delegates to `runScan()` → persists → logs. All orchestration lives in `@devlens/application`. No lifecycle/`startScan`/`failScan` calls in worker. | **KEEP** | The worker is intentionally minimal, not incomplete |
| **F-009 — Per-request DB client** | `apps/web/src/app/api/scans/route.ts` and `[id]/route.ts` call `createDatabaseClient()` inside each request handler (not module-level). `apps/web/src/lib/scan-data.ts` also creates per-call. `postgres` (postgres.js) uses lazy connection + internal pooling per client instance. Next.js App Router runs API handlers on Node.js where module-level caching persists between requests. For a demo/prototype tool with no concurrent production traffic, per-request creation is acceptable. | **KEEP/DEFER** | Acceptable for current scale; singleton would be premature without demonstrated production issue |
| **F-014 — Dead code** | `apps/web/src/app/scans/[id]/page.tsx:117` — `result.scan.target ?` ternary. `ScanResponse.target` is typed as `string` (TypeScript includes empty string `""`). The API always returns a non-empty URL, but the type system allows `""`. **4 tests** explicitly test the empty-string guard (including `does not render a Re-scan link when target is empty`). | **KEEP** | Type-correct defensive guard, not dead code. Attempted removal caused 1 test regression; reverted |
| **F-015 — Baseline logs** | Already deleted in Step 94. Covered by `.gitignore` `*.log` rule. | **Already done** | N/A |

### Additional structural audit findings (Phase 6 + 7)

| Category | Findings | Decision |
|----------|----------|----------|
| `as never` casts | 0 in source (Step 94 removed the only one in handler.ts) | ✅ Clean |
| `as any` casts | 0 in source (2 matches in comments only) | ✅ Clean |
| `as unknown as` casts | 1 in source — `postgres-repository.ts:233` (`row.httpStatusCode as unknown as HttpStatus`) — legitimate branded-type cast | ✅ Acceptable |
| `: any` type annotations | 0 in source | ✅ Clean |
| Unused exports | `getSameTargetCount` in `scan-history.ts` — imported only in test file, not in production components. Has 4 tests. | **KEEP** — tested utility, preparatory code |
| `console.*` calls | 4 in source: 3 sanitized `console.error` in handler.ts (Step 94 hardened), 1 sanitized worker error, 1 legitimate `console.log(formatResult(result))` in worker main.ts | ✅ All legitimate |
| TODO/FIXME comments | 0 in source (2 matches in test file data, not comments) | ✅ Clean |
| Architecture direction | No UI component imports `@devlens/database`, `@devlens/detectors`, or `@devlens/crawler` | ✅ Correct |
| Client/server boundaries | 9 `'use client'` directives — all on interactive components (CopyReportLink, ExportScanButton, ScanForm, etc.) | ✅ Correct |
| Secrets in logs | No secrets logged (Step 94 `toLoggableError` helper extracts only `error.name` + `error.message`) | ✅ Secure |
| Client-side DB access | No UI component or client component imports database/repository directly | ✅ Secure |

---

## Changes implemented

**None.** After auditing all 6 remaining findings (+ structural audit), no code
changes were justified:

- All 6 findings had evidence-based **KEEP / DEFER** decisions.
- The one attempted fix (F-014 dead ternary removal) caused a test regression
  and was **reverted** — the ternary is a type-correct defensive guard.

## Changes explicitly deferred

| Finding | Reason |
|---------|--------|
| F-005 (stubs) | Intentional architecture placeholders, documented in README, no value in removal for a demo-scale project |
| F-006 (Playwright) | Infrastructure disproportionate to current scope; vitest integration tests cover API behavior |
| F-008 (worker queue) | Worker is intentionally one-shot; no queue/scheduler needed for demo |
| F-009 (DB singleton) | Acceptable for current scale; postgres.js handles connections; singleton is premature |
| F-014 (dead code) | `result.scan.target ?` is type-correct defensive guard (string includes empty `""`), tested by 4 tests |
| F-010 (SSRF limitations) | Documented in ADR/architecture; mitigated by HttpCrawler's `isBlockedHostname` |
| esbuild vuln | Moderate, dev-only, not exploitable via current code path, all packages at latest version |

---

## Security audit

| Item | Status |
|------|--------|
| High/Critical vulnerabilities | 0 (PASS) |
| Moderate vulnerabilities | 1 (`esbuild@0.18.20` via drizzle-kit dev dep, documented above) |
| Raw error objects in logs | 0 (Step 94 `toLoggableError` + worker inline sanitization) |
| Client-side DB access | 0 |
| SSRF protection | `isBlockedHostname` enforces localhost/private-IP/link-local/IPv6 blocking |
| User-controlled IDs in metadata | No (scan ID not used in page `<title>`/`<meta>` — only target URL is safe) |

### esbuild vulnerability detail

- **Package:** `esbuild@0.18.20`
- **GHSA:** GHSA-67mh-4wv8-2f99 (dev-server SSRF)
- **Severity:** Moderate
- **Path:** `packages/database > drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils > esbuild`
- **Root cause:** `@esbuild-kit/core-utils@3.3.2` (latest) pins `esbuild: ~0.18.20`
- **Not exploitable because:** esbuild's dev-server `serve()` function is not used by `@esbuild-kit/core-utils` — it only uses `esbuild.transform()` and `esbuild.build()` for ESM TypeScript loading
- **Not fixable via upgrade because:** All packages in the chain (`drizzle-kit@0.31.10`, `@esbuild-kit/esm-loader@2.6.5`, `@esbuild-kit/core-utils@3.3.2`) are at their latest versions
- **Drizzle cannot be upgraded:** Step 95 constraint prohibits Drizzle upgrades
- **Below CI threshold:** `--audit-level=high` passes (Moderate excluded)

---

## Tests

```bash
pnpm exec vitest run
```

| Metric | Result |
|--------|--------|
| Test Files | 129 passed, 2 skipped (131 total) |
| Tests | **2505 passed**, 18 skipped (2523 total) |
| Duration | 7.48s |
| Regression | 0 (same as baseline) |

Note: The one attempted fix (F-014 revert) restored test count to 2505 (was briefly 2504 after the change, then restored to 2505 after revert).

## Typecheck

```bash
pnpm typecheck
```

✅ PASS — Exit 0, all workspace projects (core, crawler, detectors, database, application, web, worker, analyzer, validation, config)

## ESLint

```bash
pnpm exec eslint .
```

✅ PASS — 0 errors, 0 warnings

## Prettier

```bash
pnpm exec prettier --check .
```

✅ PASS — All matched files use Prettier code style!

## Build

```bash
pnpm build
```

✅ PASS — Next.js 15.5.26, 9 routes (6 static, 3 dynamic), 0 errors

## E2E

```bash
pnpm exec playwright test
```

**DEFERRED** — No E2E test suite exists. No `e2e/` directory. Playwright is installed but unused.
See Phase 3 decision above.

---

## Final diff audit

```bash
git diff --stat
```

No source code changes — all findings resulted in KEEP/DEFER decisions.
Only `docs/Step95.md` and `docs/Step95-report.md` are new files for this commit.

---

## Final status

| Gate | Result |
|------|--------|
| `prettier --check .` | ✅ PASS |
| `eslint .` | ✅ PASS |
| `typecheck` | ✅ PASS |
| `vitest run` | ✅ PASS (2505 passed, 18 skipped) |
| `build` | ✅ PASS |
| `pnpm audit --audit-level=high` | ✅ PASS (1 Moderate, 0 High/Critical) |

**6 findings audited, 0 fixes applied, 6 KEEP/DEFER decisions documented.**

The repository is in a clean state with all CI gates passing. The only
remaining vulnerability (`esbuild` Moderate) is below the CI threshold,
not exploitable through the current code path, and cannot be fixed without
upgrading Drizzle (prohibited by Step 95 constraints).
