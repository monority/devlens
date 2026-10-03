# Step 98 — Dependency Security Regression Audit

## Context

Step 97 (`2dfaf2d`, HEAD) fixed F-001 and all gates were green:

```
vitest run   → 2519 passed / 18 skipped
typecheck    → PASS
eslint       → PASS (exit 0)
prettier     → PASS
build        → PASS
```

The Step 97 validation also ran `pnpm audit --audit-level=high`, which returned
**4 vulnerabilities (2 moderate | 2 high)** — an `eslint → minimatch → brace-expansion`
chain. Step 94 (`f536a20`) had previously reported **0 High/Critical**. Step 98 must
determine *why* this difference exists and, only if a minimal and safe fix is available,
resolve it.

Scope: do **not** modify any dependency until the problem is reproduced and the cause is
proven. No massive updates, no arbitrary overrides, no ESLint-only changes to silence the
audit, no Next/React/TS/pnpm/monorepo-wide bumps unless proven necessary.
`.poolside/settings.local.yaml` is out of bounds.

## Phase 0 — Baseline (reproduce)

```
pnpm audit --audit-level=high   → 4 vulnerabilities (2 moderate | 2 high), exit 1
pnpm audit --json               → 4 advisories, every finding dev:true
git diff f536a20..HEAD -- pnpm-lock.yaml   → 0 lines / 0 chars  (byte-identical)
git diff f536a20..HEAD -- package.json apps/*/package.json pnpm-workspace.yaml → 0 lines
```

Full advisory inventory (from `pnpm audit --json`):

| GHSA | Package | Installed | Patch | Severity | Dev |
|---|---|---|---|---|---|
| GHSA-qhr7-859c-m2p7 | brace-expansion | 5.0.9 | ≥5.0.11 | **high** | ✅ |
| GHSA-6j4f-fj2g-mc7p | brace-expansion | 5.0.9 | ≥5.0.10 | **high** | ✅ |
| GHSA-q2hr-2g5m-vwhr | brace-expansion | 5.0.9 | ≥5.0.12 | moderate | ✅ |
| GHSA-67mh-4wv8-2f99 | esbuild         | 0.18.20 | ≥0.25.0 | moderate | ✅ |

`pnpm why brace-expansion` → single version `5.0.9`, held solely by `minimatch@10.2.6`
← `eslint@10.9.1` / `typescript-eslint@8.68.0` (dev tooling).
`pnpm why esbuild` → vulnerable `0.18.20` held by `@esbuild-kit/esm-loader@2.6.5`
(dev TS loader for `@devlens/database`), **not** Next.js (which uses non-vulnerable
`0.28.2`).

## Phase 1 — Compare with Step 94

Advisory publication / ingestion dates (GitHub Advisory Database):

- GHSA-qhr7-859c-m2p7 (high): published Sep 14, 2026 — GitHub AD Sep 29, 2026.
- GHSA-6j4f-fj2g-mc7p (high): published Sep 14, 2026 — GitHub AD Sep 29, 2026.
- GHSA-q2hr-2g5m-vwhr (moderate): published Sep 14, 2026 — GitHub AD Sep 29, 2026.
- GHSA-67mh-4wv8-2f99 (esbuild, moderate): Feb 8, 2025.

Commit timeline: `f536a20 (Step 94) 2026-09-29 15:33` → `897186a (Step 96) 2026-10-01` →
`2dfaf2d (Step 97, HEAD) 2026-10-03`.

**Conclusion:** the lockfile is byte-identical from Step 94 to HEAD, so Step 97 installed
the same packages. The 2 HIGH brace-expansion advisories entered the advisory DB on
Sep 29, 2026 — around/before Step 94's snapshot but after Step 94's audit run ingested
them. The Step 94 → HEAD "0 High/Critical" → "2 high | 2 moderate" delta is therefore an
**advisory-DB / detection-time change**, not a dependency regression. (Step 94 was not
wrong at its time.)

## Phase 2 — Verify each advisory

| Advisory | Package | Installed | Affected range | Patched | Path (abbrev.) | Dev | Real exposure |
|---|---|---|---|---|---|---|---|
| GHSA-qhr7-859c-m2p7 | brace-expansion | 5.0.9 | ≥4.0.0 <5.0.11 | ≥5.0.11 | `.>eslint>@eslint/config-array>minimatch>brace-expansion` | ✅ | Dev lint globs only; no untrusted pattern reaches `expand()`. Availability DoS, no RCE. |
| GHSA-6j4f-fj2g-mc7p | brace-expansion | 5.0.9 | ≥4.0.0 <5.0.10 | ≥5.0.10 | (same chain) | ✅ | Same; advisory confirms impact only via user-supplied glob — not present here. |
| GHSA-q2hr-2g5m-vwhr | brace-expansion | 5.0.9 | ≥4.0.0 <5.0.12 | ≥5.0.12 | (same chain) | ✅ | Quadratic CPU stall on `{a},b}` input via untrusted glob — not present here. Moderate. |
| GHSA-67mh-4wv8-2f99 | esbuild | 0.18.20 | ≤0.24.2 | ≥0.25.0 | `@devlens/database>dev>…>@esbuild-kit/esm-loader>esbuild` | ✅ | Advisory requires esbuild *dev server* (CORS `*`). Here esbuild is a **loader** (not a server); Next.js uses `0.28.2` (not vulnerable). Attack vector does not apply. |

All four are dev-only; none exposes the runtime/production app.

## Phase 3 — Candidate fixes (tried in order)

1. ESLint patch/minor — **n/a**: `eslint@10.9.1` / `@eslint/config-array@0.23.5` /
   `minimatch@10.2.6` are already latest in their lines; no ESLint bump re-resolves a
   patched `brace-expansion`.
2. Direct dep responsible — **n/a**: `brace-expansion` is not a direct dependency.
3. **Natural lockfile resolution (applied):** `pnpm up brace-expansion` → 5.0.12
   (satisfies `minimatch`'s `^5.0.0`). Resolves all three `brace-expansion` advisories
   (incl. both HIGH). Surgical: only `brace-expansion` 5.0.9→5.0.12 changes; minimatch /
   eslint / esbuild untouched. No `package.json` change, no override.
4. Override — **not used** (natural resolution already works; override interdiction respected).

## Phase 4 — Override interdiction

No `pnpm.overrides` added. The fix is a natural lockfile resolution, not a forced pin.

## Phase 5 — Defer

`esbuild@0.18.20` (GHSA-67mh-4wv8-2f99, moderate): dev-only, held by the
`@esbuild-kit/esm-loader` dev TypeScript loader; the advisory's dev-server CORS attack
vector does not apply. Fixing requires a monorepo-wide `@esbuild-kit/*` dev-tooling bump,
disallowed by this step's constraints. Deferred + documented. Does not fail
`--audit-level=high` (moderate < high).

## Phase 6 — Validation (after fix)

```
before: pnpm audit --audit-level=high → 4 vulns (2 moderate | 2 high)   exit 1
after : pnpm audit --audit-level=high → 1 vuln  (1 moderate)            exit 0
```

Full gate suite after the fix:

| Gate | Command | Result |
|------|---------|--------|
| Tests | `pnpm exec vitest run` | ✅ 2519 passed, 18 skipped (identical to Step 97) |
| Types | `pnpm typecheck` | ✅ PASS |
| Lint | `pnpm exec eslint .` | ✅ PASS (exit 0) |
| Format | `pnpm exec prettier --check .` | ✅ PASS |
| Build | `pnpm build` | ✅ PASS |
| Audit | `pnpm audit --audit-level=high` | ✅ exit 0 — 0 high |

## Outcome

**Outcome A — `chore(deps): resolve dependency security findings)`** (lockfile-only
`brace-expansion` 5.0.9 → 5.0.12 + this doc set). Both HIGH advisories eliminated (restoring
Step 94's "0 High/Critical" posture); the brace-expansion moderate likewise resolved. The
esbuild moderate is deferred (dev-only, attack-vector-inapplicable, out of scope to bump).
No regression was introduced by Step 97 — proven by the byte-identical lockfile.
