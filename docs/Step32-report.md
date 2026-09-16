# Step 32: Technology Usage Insights

## Objective

Improve the scan report by making detected technologies easier to understand at a glance. Expose concise usage context derived exclusively from the existing scan result, and add a compact summary section to completed scan reports showing the overall technology composition of the scan.

## Architecture

```
server page (/scans/[id]/page.tsx)
    ↓
    ScanLifecycle (client: polling)
        ↓
    ScanDetailView (pure presentation)
        ├── ScanSummary
        ├── ScanInsights  ← NEW (pure presentation, completed scans only)
        ├── Snapshot
        └── DetectionList
```

### Pure insights module (`lib/scan-insights.ts`)

Pure module with no React, HTTP, or database dependencies. Operates on the `ScanDetailResponse` already loaded by the server component.

Exports:

- **`ScanInsights`** interface — `{ technologyCount, evidenceCount, categoryCount, categories[], evidenceTypes[] }`
- **`getScanInsights(scan)`** — aggregates all insights into a single deterministic object
- **`getEvidenceTypeCounts(detection)`** — counts evidence items by type for a single detection
- **`getCategoryCounts(detections)`** — counts detections by category across all detections
- **`CategoryCount`** interface — `{ category: string, count: number }`
- **`EvidenceTypeCount`** interface — `{ type: string, count: number }`

### Evidence source analysis

Uses the existing `evidenceTypeLabel()` from `evidence-presenter.ts` to map evidence type strings to human-readable labels (e.g., `'http_header'` → `'HTTP Header'`). Unknown evidence types fall back to `'Evidence'` — no crashes.

Evidence items are counted as they appear in the API response. Since the detector layer already deduplicates canonical evidence, no second deduplication algorithm is introduced.

### Category derivation

Categories are derived from the existing technology catalog via `isKnownTechnology()` and `getTechnologyById()`. For unknown technology IDs (not in catalog):

- The detection is kept in the total technology count
- Category is represented as `"Unknown"` at the presentation layer only
- No category is invented for unknown IDs

### Deterministic ordering

All derived lists use explicit deterministic ordering:

- **Categories**: count DESC, then category ASC (alphabetical)
- **Evidence types**: count DESC, then type ASC (alphabetical)
- Ties are always resolved alphabetically — no reliance on object insertion order

## Files Created

- `apps/web/src/lib/scan-insights.ts` — Pure insights module (getScanInsights, getEvidenceTypeCounts, getCategoryCounts, types)
- `apps/web/src/lib/scan-insights.test.ts` — 16 pure function tests
- `apps/web/src/components/ScanInsights.tsx` — Presentation component (pure, no hooks)
- `apps/web/src/components/ScanInsights.test.tsx` — 9 component tests

## Files Modified

- `apps/web/src/components/ScanViews.tsx` — Added `ScanInsights` import, rendered in `ScanDetailView` after `ScanSummary`
- `apps/web/src/components/ScanCard.module.css` — Added styles for `.scanInsights`, `.techCount`, `.categoryComposition`, `.categoryList`, `.evidenceCoverage`, `.techList`, and related classes

## UI Integration

The `ScanInsights` component is placed in `ScanDetailView` (the pure presentation orchestrator), immediately after `ScanSummarySection` and before the snapshot/detections sections.

- **Completed scans**: renders technology count, category composition list, evidence coverage summary, and detected technologies list (known techs link to `/technologies/{id}`)
- **Completed with zero detections**: renders "0 technologies detected" (no misleading statistics)
- **Failed scans**: returns `null` — preserves existing failed-scan presentation
- **Pending/running scans**: returns `null` — preserves existing polling/status UI

## Technology Links

Reuses the Step 30 technology catalog (`isKnownTechnology` from `technology-catalog.ts`):

- Known technology IDs → `<Link href="/technologies/{id}">` with catalog link
- Unknown technology IDs → plain `<span>` text (no broken link)

## Test Coverage

### Pure insights tests (`lib/scan-insights.test.ts`) — 16 tests

**getScanInsights (8 tests):**

1. Computes insights for a completed scan with multiple technologies
2. Returns zero counts for a scan with zero detections
3. Handles a single detection
4. Groups multiple detections in the same category
5. Handles multiple categories with count DESC + alphabetical tie-breaking
6. Handles unknown technology IDs (categorized as "Unknown")
7. Counts evidence items correctly across detections
8. Produces deterministic output (no mutation)

**getEvidenceTypeCounts (3 tests):**

9. Counts evidence types for a single detection
10. Handles empty evidence
11. Aggregates same-type evidence and sorts by count DESC

**getCategoryCounts (3 tests):**

12. Returns category counts from detections
13. Handles empty detections
14. Categorizes unknown technology IDs as "Unknown"

**Additional coverage (2 tests within getScanInsights):**

15. Aggregates and sorts evidence types by count DESC then type ASC
16. Handles duplicate evidence behavior (each object counted as-is)

### Component tests (`components/ScanInsights.test.tsx`) — 9 tests

1. Renders technology count ("N technologies detected")
2. Renders category counts (sorted list)
3. Renders evidence summary ("Evidence coverage" + item counts)
4. Renders empty detection state (0 technologies, no misleading stats)
5. Does not render insights for a failed scan (returns null)
6. Does not render insights for a pending scan (returns null)
7. Does not render insights for a running scan (returns null)
8. Known technology links to `/technologies/{id}`
9. Unknown technology IDs render as plain text (no broken links, category shows "Unknown")

## Validation Results

| Check                                                | Status  | Details                                            |
| ---------------------------------------------------- | ------- | -------------------------------------------------- |
| `pnpm typecheck`                                     | ✅ Pass | All 10 workspaces typecheck clean                  |
| `pnpm test`                                          | ✅ Pass | 1270 passed, 18 skipped (72 → 74 test files)       |
| `pnpm lint`                                          | ✅ Pass | ESLint clean, Prettier all files match code style  |
| `pnpm build`                                         | ✅ Pass | All packages build, including `apps/web`           |
| `npx madge --circular --extensions ts packages apps` | ✅ Pass | No circular dependency found (194 files processed) |

`tsconfig.json` `jsx: "preserve"` confirmed intact after build.

## Architectural Decisions

1. **No new API endpoint or domain model**: All insights are derived from the already-loaded `ScanDetailResponse` passed as props. The pure `getScanInsights()` function operates on existing types only.

2. **Pure function in a separate module**: `scan-insights.ts` is a pure module with no React dependencies, making it testable with `renderToString`-free assertions. The component `ScanInsights.tsx` is a thin presentation layer.

3. **Completed scans only**: The `ScanInsights` component returns `null` for failed/pending/running scans, preserving existing presentation of those states. No insights are fabricated for non-completed scans.

4. **Reused evidence type labels**: The `evidenceTypeLabel()` function from `evidence-presenter.ts` is reused for evidence type display — no new label mapping is introduced.

5. **Reused Step 30 catalog**: Technology name links reuse `isKnownTechnology()` and `getTechnologyById()` from `technology-catalog.ts`. Known techs link to `/technologies/{id}`; unknown techs render as plain text.

6. **Deterministic ordering**: All derived lists (categories, evidence types) are explicitly sorted by count DESC then name ASC — no reliance on object insertion order, per the spec.

7. **No deduplication layer**: Evidence is counted as-is from the API response. The detector layer already deduplicates canonical evidence, so no second deduplication algorithm is introduced.

8. **Minimal CSS addition**: New styles added to `ScanCard.module.css` following existing visual language (restrained color palette, semantic spacing). No new CSS modules or styling dependencies.
