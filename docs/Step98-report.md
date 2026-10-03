# Step 98 — Report: Dependency Security Regression Audit

## 1. Baseline

HEAD after Step 97: `2dfaf2d` (`refactor(web): enforce technology data access boundary`),
parent `897186a` (`docs(audit): assess architecture and product continuity`), grandparent
`f536a20` (`chore(repo): harden CI dependencies and runtime boundaries` = Step 94 baseline
for this audit).

Step 97 baseline (all green): `vitest run` 2519 passed / 18 skipped, `pnpm typecheck` PASS,
`pnpm exec eslint .` PASS (exit 0), `pnpm exec prettier --check .` PASS, `pnpm build` PASS,
and `pnpm audit --audit-level=high` → **4 vulnerabilities (2 moderate | 2 high)**, exit 1.

`git status` at start of Step 98: clean of Step-98 changes. The only working-tree item is a
pre-existing deletion of `.poolside/settings.local.yaml` (untouched, out of scope). No
dependency or package.json has been modified yet.

## 2. Advisory inventory

`pnpm audit --json` (no `--audit-level` filter) reports **4 advisories, all `dev: true`**:

| # | GitHub Advisory (GHSA) | Package | Installed | Vulnerable range | Patched version(s) | Severity (CVSS) | Dev | Direct / transitive | Holder |
|---|---|---|---|---|---|---|---|---|---|
| 1 | GHSA-67mh-4wv8-2f99 | esbuild | 0.18.20 | `<=0.24.2` | `>=0.25.0` | moderate (5.3) | ✅ true | transitive | `@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → `@devlens/database` (devDep) |
| 2 | GHSA-q2hr-2g5m-vwhr | brace-expansion | 5.0.9 | `>=4.0.0 <5.0.12` | `>=5.0.12` | moderate (5.3) | ✅ true | transitive | `minimatch@10.2.6` ← `@eslint/config-array@0.23.5` ← `eslint@10.9.1` (and `typescript-eslint@8.68.0`) |
| 3 | GHSA-qhr7-859c-m2p7 | brace-expansion | 5.0.9 | `>=4.0.0 <5.0.11` | `>=5.0.11` | **high (7.5)** | ✅ true | transitive | (same chain) |
| 4 | GHSA-6j4f-fj2g-mc7p | brace-expansion | 5.0.9 | `>=4.0.0 <5.0.10` | `>=5.0.10` | **high (7.5)** | ✅ true | transitive | (same chain) |

`pnpm why` confirms every consumer of `brace-expansion` and `esbuild@0.18.20` is a
**devDependency** (eslint / typescript-eslint / @esbuild-kit loader). No runtime/application
package is affected.

## 3. Step 94 vs Step 97 comparison

The central question: did Step 97 introduce a dependency regression?

```
git diff f536a20..HEAD -- pnpm-lock.yaml                            → 0 lines / 0 characters
git diff f536a20..HEAD -- package.json apps/*/package.json pnpm-workspace.yaml → 0 lines / 0 characters
```

The lockfile is **byte-identical** from Step 94 (`f536a20`) through Step 97 (`2dfaf2d`), and
no `package.json` changed. Step 97 modified **only** source/test/doc files. Therefore:

> **Step 97 cannot be the cause of any advisory present at HEAD.** It installed the exact
> same package set Step 94 had.

So why did Step 94 report "0 High/Critical" while HEAD reports "2 high | 2 moderate"?
Advisory-DB / detection timing, verified against the advisory publication metadata:

| Advisory | Published (maintainer) | Published to GitHub Advisory DB | esbuild | 
|---|---|---|---|
| GHSA-67mh-4wv8-2f99 (esbuild) | **Feb 8, 2025** | Feb 10, 2025 | pre-existing; moderate → below `high`, never counted as High/Critical |
| GHSA-q2hr-2g5m-vwhr (brace-expansion) | Sep 14, 2026 | **Sep 29, 2026** | ingested around/before Step 94 (Sep 29 15:33) |
| GHSA-qhr7-859c-m2p7 (brace-expansion) | Sep 14, 2026 | **Sep 29, 2026** | ingested Sep 29, 2026 |
| GHSA-6j4f-fj2g-mc7p (brace-expansion) | Sep 14, 2026 | **Sep 29, 2026** | ingested Sep 29, 2026 |

Commit dates in the repo timeline:

```
f536a20 (Step 94) ... 2026-09-29 15:33 +0200
897186a (Step 96) ... 2026-10-01 23:52 +0200
2dfaf2d (Step 97, HEAD) ... 2026-10-03 15:43 +0200
```

The two **HIGH** brace-expansion advisories were ingested into the GitHub Advisory Database
on **Sep 29, 2026** — the same calendar day as Step 94's commit (`15:33 +0200`), but the npm
advisory DB that `pnpm audit` consults ingests from GitHub with a lag. Step 94's audit run
therefore did not yet surface them; HEAD's run (Oct 3) does. Combined with the
**byte-identical lockfile**, this confirms the Step 94 → HEAD audit delta is an
**advisory-DB / detection-time change**, not a Step 97 regression. (The esbuild moderate
dates to Feb 2025 and was always below the `high` threshold, so it never affected the
"0 High/Critical" count either.)

## 4. Dependency tree

Direct devDependencies (root `devlens@0.1.0`): `eslint@10.9.1`, `@eslint/js@10.0.1`,
`typescript-eslint@8.68.0`, `eslint-config-prettier@10.1.8`, `@typescript-eslint/*@8.68.0`.

`brace-expansion` resolution: **single version only** — `brace-expansion@5.0.9`, held solely
by `minimatch@10.2.6` (`pnpm why brace-expansion` → "Found 1 version of brace-expansion").
`minimatch@10.2.6` is pulled by `@eslint/config-array@0.23.5` (via `eslint@10.9.1`) and by
`@typescript-eslint/eslint-plugin@8.68.0` / `@typescript-eslint/typescript-estree@8.68.0`.
All consumers are dev tooling.

`esbuild` versions present in the tree: `0.18.20` (via
`@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → `@devlens/database`,
devDep), `0.25.12` (via `@devlens/database`, devDep) and `0.28.2` (via root `devlens`
devDep = Next.js). The **vulnerable `0.18.20` comes from the old `@esbuild-kit` chain, NOT
from Next.js** (which uses the non-vulnerable `0.28.2`, outside `<=0.24.2`).

Because `minimatch@10.2.6` declares `brace-expansion: ^5.0.0`, a natural lockfile re-resolution
can advance `brace-expansion` to the latest `5.x` (`5.0.12`) with no other package changing.

## 5. Exploitability / context

- **brace-expansion GHSA-qhr7 / GHSA-6j4f (HIGH):** DoS via uncontrolled recursion
  (stack exhaustion) when an untrusted brace pattern reaches `expand()`, reached through
  `minimatch`/`glob`. In this repo `brace-expansion` is consumed **only** by ESLint's
  `@eslint/config-array` glob matching (static config file patterns); no untrusted/user
  string reaches `expand()`. The GHSA-6j4f advisory even notes it "Confirmed on minimatch
  10.2.6" — but only via a user-supplied glob pattern, which this repo does not expose.
  Upstream severity is High (availability only — no RCE, no data exposure); real repo
  exposure ≈ none (dev-time lint, no untrusted input).
- **brace-expansion GHSA-q2hr (moderate):** quadratic CPU/stall on `{a},b}`-shaped input;
  same context — static lint globs, no untrusted input. Moderate.
- **esbuild GHSA-67mh (moderate):** "any website can send requests to the development server
  and read the response" — requires esbuild running its **`serve`/dev-server feature** with
  `Access-Control-Allow-Origin: *`. In this repo `esbuild@0.18.20` is a **library** dependency
  of `@esbuild-kit/esm-loader` (a TypeScript loader used by the `@devlens/database` tests),
  **not** a dev server. The advisory's attack vector does **not** apply. (A `pnpm dev` run
  uses Next.js's esbuild `0.28.2`, which is outside the vulnerable range `<=0.24.2`.)
  → Effectively a false positive in this context; moderate.

**Net:** none of the 4 advisories expose the runtime/production application. They are all
dev-only tooling, and their upstream attack vectors do not map to this repo's usage. No
fix is *urgent*; the step attempts only a minimal, safe, no-risk fix and defers the rest.

## 6. Candidate fixes

Tested in task order against the constraint "no massive update, no arbitrary override, no
Next/React/TS/pnpm/eslint-direct bump unless proven necessary":

1. **ESLint patch/minor:** eslint is already `10.9.1` (latest 10.x); `@eslint/config-array`
   `0.23.5` and `minimatch` `10.2.6` are the latest releases of their lines. No ESLint update
   re-resolves a patched `brace-expansion`, so this is the wrong lever.
2. **Direct dependency responsible:** `brace-expansion` is **not** a direct dependency of the
   monorepo (direct devDeps are only `eslint`, `@eslint/js`, `typescript-eslint`,
   `eslint-config-prettier`, `@typescript-eslint/*`). No direct dep to bump.
3. **Natural lockfile resolution (SELECTED):** `pnpm up brace-expansion` → `5.0.12`.
   `minimatch@10.2.6` allows `^5.0.0`, so `5.0.12` satisfies it. This single transitive
   patch resolves GHSA-qhr7 (`≥5.0.11`), GHSA-6j4f (`≥5.0.10`) and GHSA-q2hr (`≥5.0.12`)
   → eliminates **both HIGH** advisories plus the brace-expansion moderate.
   - Before: 4 vulns (2 moderate | 2 high), exit 1.
   - After: 0 high, 1 moderate (esbuild), exit 0.
   - Dependency-tree delta: `brace-expansion` 5.0.9 → 5.0.12 only
     (`minimatch 10.2.6`, `eslint 10.9.1`, `esbuild` unchanged). Surgical.
4. **`pnpm.overrides`:** **not added** — natural resolution already works; the override
   interdiction is respected.

## 7. Selected decision

**Apply the minimal natural lockfile fix (candidate 3):** bump `brace-expansion` 5.0.9 →
5.0.12. This removes **both HIGH** advisories (restoring the "0 High/Critical" Step-94 audit
posture) via a single transitive patch that passes the **full** gate suite. `pnpm install`
then synced `node_modules` to the patched version.

**Defer esbuild (GHSA-67mh-4wv8-2f99, moderate):** dev-only, held by the `@esbuild-kit/esm-loader`
dev TypeScript loader for `@devlens/database`; its attack vector (dev-server CORS SSRF) does
not apply (esbuild is used as a loader, not a dev server; Next.js uses non-vulnerable 0.28.2).
Fixing it would require bumping `@esbuild-kit/*` — a monorepo-wide dev-tooling update that
the Step 98 constraints explicitly disallow ("Ne pas mettre à jour … toutes les dépendances
du monorepo"). A deferral (with documented impact) is the correct, non-faux outcome. It is
moderate and therefore does not fail `pnpm audit --audit-level=high`.

## 8. Changes

Exactly one tracked file changes; no `package.json` / `pnpm-workspace.yaml` / source change:

`pnpm-lock.yaml` (lockfile-only re-resolution):
- lockfile node `brace-expansion@5.0.9` → `brace-expansion@5.0.12`;
- `minimatch@10.2.6` dependency pointer `brace-expansion: 5.0.9` → `5.0.12`.

No `pnpm.overrides` added. `.poolside/settings.local.yaml` untouched (pre-existing deletion,
excluded from the commit). The two stray `/docs/Step8*`-era files and `.tmp-audit-step98.json`
/ `.tmp-audit-full.json` (temporary audit artifacts) were removed / left untracked and are
not part of this commit.

## 9. Validation

Full gate suite after the fix (all green):

| Gate | Command | Result |
|------|---------|--------|
| Tests | `pnpm exec vitest run` | ✅ 2519 passed, 18 skipped — **identical to Step 97 baseline** (18 = DB-integration tests skipping without `DATABASE_URL`) |
| Types | `pnpm typecheck` | ✅ PASS (all workspace packages) |
| Lint | `pnpm exec eslint .` | ✅ PASS (exit 0) |
| Format | `pnpm exec prettier --check .` | ✅ PASS |
| Build | `pnpm build` | ✅ PASS |
| Audit | `pnpm audit --audit-level=high` | ✅ exit 0 — 1 moderate (esbuild, deferred), **0 high** |

Pre-fix vs post-fix:

```
before: pnpm audit --audit-level=high → 4 vulnerabilities (2 moderate | 2 high)   exit 1
after : pnpm audit --audit-level=high → 1 vulnerability  (1 moderate)              exit 0
```

## 10. Remaining vulnerabilities

- `esbuild@0.18.20` — GHSA-67mh-4wv8-2f99 — **moderate** — held by
  `@esbuild-kit/esm-loader@2.6.5` (dev TS loader for `@devlens/database`; NOT Next.js, which
  uses non-vulnerable `0.28.2`). Attack vector (dev-server CORS SSRF) does not apply (esbuild
  used as a loader, not a dev server). Out of scope: fixing requires a monorepo-wide
  `@esbuild-kit/*` dev-tooling update, disallowed by this step's constraints.
  `--audit-level=high` does **not** fail on it (moderate < high).
  **Reconsider** in a dedicated dev-tooling step when `@esbuild-kit/esm-loader` is upgraded
  (or `@devlens/database` drops the `@esbuild-kit` loader).

No HIGH/Critical advisories remain. No runtime/application exposure remains.

## 11. Final decision

**Outcome A — `chore(deps): resolve dependency security findings`.**

The "4 vulnerabilities vs Step 94's 0 High/Critical" was **proven NOT a Step 97 regression**:
the lockfile (`pnpm-lock.yaml`) is byte-identical from `f536a20` (Step 94) to HEAD, and no
`package.json` changed across `f536a20..HEAD`; the 2 HIGH brace-expansion advisories were
published/ingested to the advisory database on **Sep 29, 2026** (around Step 94's audit run,
after it), so the delta is an advisory-DB detection change, not a dependency change. All 4
advisories are dev-only tooling with no production exposure; the esbuild one's attack vector
does not apply here at all.

A minimal, safe, **lockfile-only** transitive patch (`brace-expansion` 5.0.9 → 5.0.12)
eliminates both HIGH advisories and the brace-expansion moderate (3 of 4), with the **entire**
gate suite green. `esbuild` (moderate) is deferred: dev-only, attack-vector-inapplicable, and
out of scope to bump under this step's constraints. No overrides added; no
Next/React/TS/pnpm/eslint-direct change; no package.json change.
