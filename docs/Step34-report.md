# Step 34: Technology Composition & Coexistence Insights

## Objective

Add a compact "technology composition" section to completed scan reports showing how detected technologies coexist within the same scan. The feature is strictly descriptive — it groups technologies by category without inferring dependencies, compatibility, causality, architecture, or relationships not explicitly represented by the scan result.

## Architecture

```
ScanDetailView (pure presentation orchestrator)
  ↓
  ScanInsights (pure presentation component)
    ├── getScanInsights() (pure function, extended)
    │     └── getTechnologyComposition() (new pure function)
    │           ├── technology-catalog.ts (isKnownTechnology)
    │           └── types.ts (DetectionResponse)
    └── renders existing sections + new Technology composition section
```

The composition is derived entirely from the existing `ScanDetailResponse` and the technology catalog wrapper (`lib/technology-catalog.ts`). No new API endpoint, no database query, no persistence changes, no detector modifications.

### Pure composition function (`lib/scan-insights.ts`)

Added to the existing pure insights module:

- **`TechnologyCompositionItem`** interface — `{ id: string; name: string }`
- **`TechnologyCategoryComposition`** interface — `{ category: string; technologies: TechnologyCompositionItem[] }`
- **`getTechnologyComposition(detections)`** — groups detected technologies by category, deduplicating by technology ID. Returns a sorted array of category compositions.

### Composition model

For each detection:

1. Resolve its catalog metadata via `isKnownTechnology(technology.id)`.
2. Determine its category: catalog category if known, `"Unknown"` if not.
3. Group the technology under that category.

**Duplicate handling**: if the same technology ID appears in multiple detection rows, it appears only once in the composition. The first occurrence's name is preserved.

**Category ordering**: by technology count DESC, then category ASC.

**Technology ordering within a category**: by name ASC, then ID ASC (deterministic tie-breaker).

### Unknown technology handling

If a detection contains an unknown technology ID (not in the catalog):

- Preserved in the total count (technologyCount includes it)
- Placed in an `"Unknown"` presentation category
- Displays its original technology name from the detection
- No catalog entry is created, no technology link is rendered (plain text)
- Does not cause the entire composition to fail

### UI integration

`ScanInsights.tsx` was updated to render a new "Technology composition" section after the existing "Detected technologies" list. The existing insights UI (technology count, category counts, evidence coverage, detected technologies list) remains fully intact.

The section renders only when there is at least one technology in the composition (non-empty scans). For failed/pending/running scans, `ScanInsights` returns `null` (no composition rendered). For completed scans with zero detections, the existing empty-state behavior is preserved (composition is not rendered).

### Relationship wording

The UI uses strictly descriptive language:

- "Technology composition"
- "{Category} · {count}"
- Technology names link to `/technologies/{id}` for known technologies

Words that would imply relationships are explicitly avoided: "Technology stack", "Dependencies", "Built with", "Compatible technologies", "Technology relationships", "Architecture".

### Determinism

All ordering is explicit — no reliance on object insertion order, detector order, database order, or browser order. The same scan input always produces exactly the same composition.

## Files Created

- `docs/Step34-report.md` — This report

## Files Modified

- `apps/web/src/lib/scan-insights.ts` — Added `TechnologyCompositionItem`, `TechnologyCategoryComposition` interfaces, `getTechnologyComposition()` function, and `technologyComposition` field to the `ScanInsights` interface and `getScanInsights()` return value
- `apps/web/src/lib/scan-insights.test.ts` — Added 11 pure composition tests
- `apps/web/src/components/ScanInsights.tsx` — Added "Technology composition" section rendering
- `apps/web/src/components/ScanInsights.test.tsx` — Added 8 component composition tests
- `apps/web/src/components/ScanCard.module.css` — Added `.technologyComposition`, `.compositionCategory`, `.compositionCategoryLabel`, `.compositionTechList`, `.compositionTechItem`, `.compositionTechName`, `.compositionTechCategory` styles

## Test Coverage

### Pure composition tests (`lib/scan-insights.test.ts`) — 11 tests

1. Groups multiple technologies across multiple categories
2. Groups multiple technologies in one category
3. Deduplicates technologies with the same ID
4. Preserves the first occurrence name for duplicate IDs
5. Places unknown technology IDs in the "Unknown" category
6. Preserves unknown technology name from detection
7. Handles empty detections
8. Sorts categories by count DESC then category ASC
9. Sorts technologies within a category by name ASC then id ASC
10. Produces identical output across calls (no mutation, deterministic)
11. Does not mutate the input detections array

### Component tests (`components/ScanInsights.test.tsx`) — 8 new tests (17 total)

1. Renders the composition section for a completed scan with multiple categories
2. Groups technologies by category in the composition
3. Renders known technology names as catalog links
4. Renders unknown technology names as plain text (no link)
5. Does not render composition for an empty detection scan
6. Does not render composition for a failed scan
7. Does not render composition for a pending scan
8. Renders composition with descriptive wording (no relationship terms)

## Validation Results

| Check                                                | Status  | Details                                            |
| ---------------------------------------------------- | ------- | -------------------------------------------------- |
| `pnpm typecheck`                                     | ✅ Pass | All 10 workspaces typecheck clean                  |
| `pnpm test`                                          | ✅ Pass | 1306 passed, 18 skipped (75 test files)            |
| `pnpm lint`                                          | ✅ Pass | ESLint clean, Prettier all files match code style  |
| `pnpm build`                                         | ✅ Pass | All packages build, including `apps/web`           |
| `npx madge --circular --extensions ts packages apps` | ✅ Pass | No circular dependency found (196 files processed) |

`tsconfig.json` `jsx: "preserve"` confirmed intact after build.

## Constraints Compliance

- ✅ No detector modifications
- ✅ No scoring or confidence changes
- ✅ No evidence generation changes
- ✅ No crawler behavior changes
- ✅ No persistence changes
- ✅ No API contract changes
- ✅ No API endpoints added
- ✅ No database fields added
- ✅ No dependencies added
- ✅ No AI/LLM analysis
- ✅ No inferred dependencies, compatibility, or relationships
- ✅ No external technology metadata
- ✅ No second technology catalog
- ✅ No changes to detection ordering

## Explicit Non-Inferences

The composition view does **not** claim:

- Technologies are related by design
- Technologies are compatible with each other
- Technologies are part of a stack
- Technologies have dependency relationships
- Technologies share an architecture

The fact that two technologies appear together means only that they were both detected in the same scan.
