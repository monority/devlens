# Step 26: Scan Comparison Feature

## Objective

Create a scan comparison feature at `/scans/compare?left=<id>&right=<id>` that compares two existing scans using the existing HTTP API, with a pure `compareScans()` function and presentation components.

## Architecture

### Pure Comparison Module (`lib/comparison.ts`)

A pure TypeScript module with no React, HTTP, or database dependencies. It takes two `ScanDetailResponse` values (either of which may be `null`) and produces a deterministic `ComparisonResult`.

**Key design decisions:**

- **Technology identity**: compared by stable `technology.id` (not display name, not array ordering)
- **Evidence identity**: deterministic key derived from evidence type + identifying fields
  - `http_header:${name}`, `meta_tag:${name}`, `script_url:${url}`, `script_content:${snippet}`, `html:${selector}`, `javascript_global:${globalName}`, `resource:${url}`, `link:${url}`, fallback `unknown:${JSON.stringify(item)}`
- **Evidence comparison**: only for technologies present in both scans
- **Failed scan handling**: when a scan has `status === 'failed'`, detection comparison is unavailable (no `added`/`removed`/`scoreChanges`/`evidenceChanges` computed); a notice is displayed to the user

**Exports:** `evidenceKey(item)`, `compareScans(left, right) → ComparisonResult`, types: `ComparisonInput`, `EvidenceStatus`, `EvidenceComparison`, `TechnologyComparison`, `ComparisonResult`.

**`ComparisonResult` fields:**

- `hasChanges: boolean` — whether any detection-level changes exist
- `leftNotFound`, `rightNotFound` — true when the respective scan fetch returned `null`
- `leftFailed`, `rightFailed` — true when the respective scan has `status === 'failed'`
- `targetsDiffer` — true when left and right scan targets differ
- `hasBoth` — true when neither scan is missing (both exist)
- `added`, `removed`, `unchanged` — `DetectionResponse[]` arrays for technologies only in left, only in right, and in both
- `scoreChanges` — `TechnologyComparison[]` for technologies in both where confidence changed
- `evidenceChanges` — `EvidenceComparison[]` for evidence in technologies present in both
- `left`, `right` — the original `ScanDetailResponse | null` values (for rendering scan headers)

### Comparison API Adapter (`lib/comparison-api.ts`)

A thin adapter that:

1. Calls `fetchScanById(leftId)` and `fetchScanById(rightId)` concurrently via `Promise.all`
2. Passes both results to `compareScans()`

Exports: `fetchComparison(leftId, rightId)`, `compareScanResults(input)`.

### Presentation Component (`components/ScanComparison.tsx`)

Pure presentation component receiving `ComparisonResult` as props. Sub-components:

- `ComparisonHeader` — renders `ScanSummary` for both scans
- `ComparisonError` — renders when one or both scans are missing (404)
- `TechnologyChanges` — renders added/removed/unchanged technology lists, score changes table, and evidence changes table
- `TechnologyComparisonItem` — individual technology in the changes list
- `ScoreChangeRow` — table row for a confidence change
- `EvidenceChangeList` — table of evidence changes for a technology
- `EvidenceChangeRow` — individual evidence change row

Uses `<details>`/`<summary>` for collapsible evidence, `<ol>`/`<li>` for detection lists, `<table>` for score/evidence changes.

### Route Page (`app/scans/compare/page.tsx`)

Server component that:

1. Reads `left` and `right` from `searchParams` (async)
2. If either is missing, renders `MissingParams` notice
3. Fetches both scans via `fetchScanById` concurrently
4. Calls `compareScans()` (pure function)
5. Renders `ScanComparison` with the result
6. On API error (catch), renders `ScansError`

### Navigation Links

- `/scans` page (`page.tsx`) — added "Compare two scans" link to `/scans/compare`
- `/scans/[id]` page (`page.tsx`) — added "Compare with another scan" link to `/scans/compare?left=<id>`
- CSS classes added to `ScanCard.module.css`, `page.module.css`, and `[id]/page.module.css`

## Implementation Notes

### React 19 `renderToString` quirks addressed

- `renderToString` inserts `<!-- -->` around numbers in JSX text — tests clean these with `.replace(/<!-- -->/g, '')`
- `renderToString` escapes HTML inside `<code>` tags (e.g. `<meta>` → `&lt;meta&gt;`) — tests account for this

### Import path conventions

- Next.js webpack does NOT resolve `.js` → `.ts` for relative **value** imports — all value imports omit `.js`
- Type-only imports (`import type`) may keep `.js` (erased at compile time)
- `@/` alias works in both Next.js (via `tsconfig.json` paths) and vitest (via `resolve.alias`)

### No new dependencies

- No third-party UI libraries, charts, auth, pagination, filtering, or export/PDF
- No database schema changes
- No new API endpoints — uses existing `GET /api/scans/:id`

## Test Coverage

### Pure comparison tests (`lib/comparison.test.ts`) — 17 tests

1. detects identical scans as no changes (1 test)
2. detects added technologies (1 test)
3. detects removed technologies (1 test)
4. detects score/confidence changes (1 test)
5. detects added evidence (1 test)
6. detects removed evidence (1 test)
7. detects modified evidence value (1 test)
8. detects identical evidence as unchanged (1 test)
9. detects different targets (1 test)
10. handles both scans missing (1 test)
11. handles left scan missing (1 test)
12. handles right scan missing (1 test)
13. handles failed left scan (1 test)
14. handles failed right scan (1 test)
15. handles failed both scans (1 test)
16. evidenceKey generates keys for all 8 evidence types (1 test)
17. evidenceKey uses fallback for unknown types (1 test)

### UI component tests (`components/ScanComparison.test.tsx`) — 8 tests

1. renders a successful comparison with both scan summaries
2. renders missing left scan state
3. renders missing right scan state
4. renders failed scan comparison with limited detection notice
5. renders "No detection changes" for identical scans
6. renders technology changes (added and removed)
7. renders score/confidence changes
8. renders evidence changes

### Evidence presenter tests (`lib/evidence-presenter.test.ts`) — 30 tests (pre-existing, unaffected)

## Validation Results

| Check                                                | Status  | Details                                                                                |
| ---------------------------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                     | ✅ Pass | All 10 workspaces (`apps/web`, `apps/worker`, `packages/*`) — `jsx: "preserve"` intact |
| `pnpm test`                                          | ✅ Pass | 1126 passed, 18 skipped (up from 1030 baseline; +96 new tests)                         |
| `pnpm lint`                                          | ✅ Pass | ESLint clean, Prettier all files match code style                                      |
| `pnpm build`                                         | ✅ Pass | All packages build, including `apps/web` with `/scans/compare` route                   |
| `npx madge --circular --extensions ts packages apps` | ✅ Pass | No circular dependency found                                                           |
