# Step 94 — Monorepo Production Hardening

**Type:** Implementation hardening step (not a product feature)
**Status:** Complete
**Scope:** Repository-wide CI, dependency, API-boundary, and runtime logging hardening

## Objective

Address the findings from the full-project audit-hardening pass that are sufficiently
demonstrated and safe to fix now. This step hardens existing CI, dependencies, and
runtime boundaries without introducing new features or architecture.

## Findings addressed

| Finding | Severity | Action |
|---------|----------|--------|
| F-002  — Prettier CI gate failure (docs not ignored) | HIGH     | FIX_NOW  |
| F-013  — Vulnerable transitive dependencies (postcss, sharp) | HIGH     | FIX_NOW  |
| F-016  — No dependency audit in CI | MEDIUM   | FIX_NOW  |
| F-003  — `ScanId as never` type-safety bypass at API boundary | MEDIUM   | FIX_NOW  |
| F-007  — Raw error objects in server-side logging | MEDIUM   | FIX_NOW  |
| F-001  — Stale README project-status statement | LOW      | FIX_NOW  |

## Findings explicitly deferred

| Finding | Rationale |
|---------|-----------|
| F-005 — Empty reserved workspaces (analyzer, validation, config) | Architectural placeholder; no consumer; deferred decision |
| F-006 — Playwright configured but no E2E tests | E2E strategy decided separately |
| F-008 — Worker queue architecture (one-shot demo) | Requires separate scalability decision |
| F-009 — Database connection lifecycle/pooling | Requires separate scalability decision |
| F-014 — Defensive dead-code cleanup in page.tsx | Unrelated to hardening scope |
| F-015 — Baseline log cleanup | Artifacts were removed before this step |
| F-004 — Test fixture `as unknown as` casts | Acceptable for branded-type fixtures in tests |
| F-010 — Documented SSRF guard limitations | Mitigated by network policy in production; documented |

## Dependency-security strategy

1. **Prefer direct dependency upgrade** — Next.js upgraded from 15.5.24 to
   15.5.26 (latest stable `backport` tag in the 15.5.x track).
2. **Lockfile refresh** — `pnpm install` re-resolved transitive deps.
3. **Compatible Next.js patch** — 15.5.26 changes `sharp` range from
   `^0.34.3 \|\| ^0.35.3` to `^0.34.3 \|\| ^0.35.4`, allowing sharp 0.35.5
   (patched).
4. **Targeted override only for postcss** — No Next.js release (including
   15.6.0-canary.61) bundles a patched postcss (all pin 8.4.31). A pnpm
   workspace override forces `postcss: 8.5.26` for the entire tree.
   Vite already uses 8.5.26, so this is a zero-churn alignment.
5. **CI gate** — `pnpm audit --audit-level=high` fails only on High/Critical.
   Moderate vulnerabilities (e.g. the pre-existing esbuild dev-server SSRF
   advisory GHSA-67mh-4wv8-2f99) do not block CI.

## Validation gates

| Check | Command | Expected |
|-------|---------|----------|
| Prettier | `pnpm exec prettier --check .` | PASS |
| ESLint | `pnpm exec eslint .` | PASS |
| Typecheck | `pnpm typecheck` | PASS |
| Tests | `pnpm test` | PASS (≥ baseline) |
| Build | `pnpm build` | PASS |
| Audit | `pnpm audit --audit-level=high` | PASS (exit 0) |
