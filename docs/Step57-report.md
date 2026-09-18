# Step 57: Scan History & Same-Target Context — Report

## STATUS

**Complete.** All validation passes.

## Commit

```
Step 57: Scan History & Same-Target Context
```

## Step 0 Findings

Inspected the existing implementation:

1. **Timestamp field:** `scan.createdAt` (ISO 8601) is already present on every `ScanSummary`. Displayed in `ScanCard` via `<time dateTime={scan.createdAt}>`.

2. **Ordering already deterministic:** `PostgresScanResultRepository.list()` (line 350) orders by `orderBy(desc(scans.createdAt), asc(scans.id))` — i.e., `createdAt DESC, scanId ASC`. The frontend `filterScans()` preserves input order (no re-sorting). This is already correct and was verified.

3. **Target storage:** `ScanResponse.target` is the normalized URL string from `new URL().href`. Always present for both completed and failed scans. Stored in DB `url` column.

4. **Scan list exposes:** target, hostname, status, createdAt/completedAt/failedAt timestamps, detection count (for terminal statuses). `ScanHistory` component reads `scans: ScanSummary[]` from `GET /api/scans` and passes to `ScanCard`.

5. **No existing target-formatting utility** in `apps/web/src/lib/`. Target is used verbatim from the API response. Per spec: "Do NOT invent a new URL normalization algorithm."

6. **Same-target grouping** is implementable entirely at the presentation layer — all scans are fetched in a single API call, and target identity uses the existing `scan.target` string. No persistence changes needed.

## Files Changed

| File | Change |
|---|---|
| `apps/web/src/lib/scan-history.ts` | **NEW** — pure helper: `countScansByTarget()` builds a `Map<string, number>` from scan list; `getSameTargetCount()` convenience wrapper. |
| `apps/web/src/lib/scan-history.test.ts` | **NEW** — 7 tests: counting, string-identity, empty list, special URL chars, cross-status. |
| `apps/web/src/lib/scan-filter.test.ts` | Added regression test: `preserves deterministic ordering: createdAt DESC, id ASC tiebreaker`. |
| `apps/web/src/components/ScanViews.tsx` | `ScanCard` accepts optional `sameTargetCount?: number`; renders compact "N scans" badge when `> 1`. |
| `apps/web/src/components/ScanViews.test.tsx` | 5 new tests for `ScanCard`: no badge when absent, no badge when=1, badge when>1, singular hidden, metadata preserved. |
| `apps/web/src/components/ScanHistory.tsx` | Computes `targetCounts = countScansByTarget(scans)` from full list; passes `sameTargetCount` to each `ScanCard`. |
| `apps/web/src/components/ScanHistory.test.tsx` | **NEW** — 9 tests: repeated targets show count, unique targets hidden, special URL chars, ordering preserved, individual clickability, failed scans visible, empty state. |
| `apps/web/src/components/ScanCard.module.css` | Added `.sameTargetCount` badge styling (compact, blue theme, `:focus-visible` inherited from badge). |
| `docs/Stepo57.md` | Spec file (provided). |

## Exact Implementation

### `lib/scan-history.ts`

```typescript
export function countScansByTarget(scans: ScanSummary[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const scan of scans) {
    counts.set(scan.target, (counts.get(scan.target) ?? 0) + 1);
  }
  return counts;
}
```

This is a pure function with no HTTP, DB, or React dependencies. The target key uses the existing `scan.target` string verbatim — no new normalization.

### `ScanCard` (in `ScanViews.tsx`)

Added an optional `sameTargetCount` prop. When the count is greater than 1, a compact badge is rendered:

```tsx
{sameTargetCount > 1 && (
  <span className={styles.sameTargetCount}>
    {sameTargetCount} scan{sameTargetCount === 1 ? '' : 's'}
  </span>
)}
```

### `ScanHistory.tsx`

```tsx
// Computed from the FULL scan list (before filtering) so the count
// reflects all scans of this target, not just the filtered subset.
const targetCounts = countScansByTarget(scans);

{filtered.map((scan) => (
  <ScanCard
    key={scan.id}
    scan={scan}
    sameTargetCount={targetCounts.get(scan.target) ?? 0}
  />
))}
```

## Same-Target Identity Logic Used

- **Identity key:** `scan.target` — the existing normalized URL string from the API.
- **No new normalization algorithm** introduced (per spec requirement).
- Different URL spellings (`https://example.com` vs `https://example.com/` vs `http://example.com/`) are treated as distinct targets, matching the existing domain behavior.
- Works for both completed and failed scans (target is always stored in DB).
- Special URL characters (query strings, fragments, encoded URLs) are rendered safely — `renderToString` HTML-escapes `&` to `&amp;`, and the target string is used as-is for the count key.

## Ordering Logic

- **No changes made** — ordering was already correct at the database layer.
- `PostgresScanResultRepository.list()` returns `createdAt DESC, scanId ASC` — newest first with stable `scanId` ascending as the deterministic tie-breaker.
- `filterScans()` in `lib/scan-filter.ts` preserves this order (no re-sorting).
- Regression test added to lock in the contract.

## Accessibility Changes

- The same-target count badge is purely presentational (a `<span>`), not interactive — no additional keyboard/focus requirements.
- Existing `:focus-visible` styles on link classes (from Step 55) remain in place.
- No color-only communication — the badge uses both color and text ("N scans").

## Tests Added

| Count | Location | What it covers |
|---|---|---|
| 7 | `scan-history.test.ts` | `countScansByTarget` + `getSameTargetCount`: counting, string identity, empty list, special URL chars, cross-status grouping |
| 1 | `scan-filter.test.ts` | Ordering regression: `createdAt DESC, id ASC` tiebreaker |
| 5 | `ScanViews.test.tsx` | `ScanCard` badge visibility: no prop → no badge, =1 → no badge, >1 → badge shown, metadata preserved |
| 9 | `ScanHistory.test.tsx` | Same-target count displayed, unique targets hidden, special URL chars, ordering preserved, individual clickability, failed scans visible, empty state |
| 7 | (existing) `app/scans/[id]/page.test.tsx` | Re-scan link from Step 56 remains intact |

**Total new tests: 22** (plus 1 regression test extended).

## Full Validation Results

| Check | Result |
|---|---|
| Vitest | ✅ 1671 passed, 18 skipped (95 test files, 2 skipped) |
| `tsc --noEmit` | ✅ Passes |
| ESLint | ✅ Passes |
| Prettier | ✅ All matched files use Prettier code style |
| `next build` | ✅ Passes (all routes built) |
| madge | ✅ 87 files processed, no circular dependencies |
| `jsx: "preserve"` | ✅ Intact in `apps/web/tsconfig.json` |

## Architectural Issues Discovered

- None. The existing architecture fully supports same-target context at the presentation layer. All scan data (target, timestamps, status) is already available via `GET /api/scans`. No persistence or API changes were needed.

## Re-scan Semantics Confirmation (Step 56 — Unchanged)

- The Re-scan link on `/scans/{id}` navigates to `/scans/new?target=<encoded-target>`.
- The target is pre-filled in the `ScanForm` via `initialUrl` prop (defaults to `''`).
- No auto-submit — the user must explicitly click "Start scan".
- The existing scan is NOT mutated or retried; a new scan record is created.
- Existing Step 56 tests (`app/scans/[id]/page.test.tsx`: 7 tests) continue to pass.

## Scope Confirmation

### In Scope (implemented)
- Scan history ordering — verified as already correct, added regression coverage ✅
- Clearer scan metadata — target + hostname + status + timestamp already present ✅
- Lightweight same-target context — compact "N scans" badge on `ScanCard` ✅
- Deterministic same-target derivation — pure `countScansByTarget` using existing target identity ✅
- Focused tests — 22 new tests added ✅
- Accessibility — badge is non-interactive; existing focus styles preserved ✅

### Out of Scope (NOT implemented)
- Scan comparison redesign ✅ (not touched)
- Diffing results ✅ (not touched)
- Technology trend charts ✅ (not touched)
- Scan scheduling / background workers / notifications ✅ (not touched)
- Authentication ✅ (not touched)
- Scan deletion / retention ✅ (not touched)
- Database schema redesign / API redesign ✅ (not touched)
- Crawler/detector changes ✅ (not touched)
- New visual design system ✅ (not touched)
- Pagination ✅ (not touched — existing implementation has no pagination boundary issue)
