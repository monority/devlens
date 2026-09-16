# Step 31: Technology Catalog Search & Filtering

## Objective

Extend the existing `/technologies` catalog with deterministic, client-side search and category filtering. The catalog source of truth remains the `@devlens/detectors` catalog wrapped by `lib/technology-catalog.ts`. This step adds filtering logic, a minimal client boundary for filter controls, URL state sync, and comprehensive test coverage.

## Architecture

```
server page (/technologies/page.tsx)
    ↓
    catalog from existing source (getTechnologies())
    ↓
    client filter controls (TechnologyCatalogView)
        ↓
        TechnologyFilters (pure presentation)
        ↓
        pure in-memory filtering (filterTechnologies())
        ↓
        filtered list with /technologies/{id} links
```

The page remains **server-rendered** except for the minimal `TechnologyCatalogView` client boundary. The browser does not request the catalog again — all data is passed as props from the server component.

### Pure filtering (`lib/technology-filter.ts`)

Pure module with no React, HTTP, or database dependencies. Operates on the `TechnologyPresentation[]` returned by `getTechnologies()`.

Exports:

- **`TechnologyFilters`** interface — `{ search: string; category: string }`
- **`filterTechnologies(technologies, filters)`** — case-insensitive substring search across `name`, `id`, `category`, `description` + exact category match. Preserves order, does not mutate input, deterministic.
- **`getTechnologyCategories(technologies)`** — sorted unique categories derived from the given list.
- **`isValidTechnologyCategory(category)`** — checks against the default catalog's categories using `getTechnologies()`.
- **`buildTechnologyUrl(search, category)`** — pure URL builder for `/technologies?q=…&category=…` (omits empty values).

### Filter UI (`components/TechnologyFilters.tsx`)

Pure presentation component (no hooks, no router). Props: `search`, `category`, `categories`, `resultCount`, `totalTechnologies`, `onSearchChange`, `onCategoryChange`, `onReset`. Renders search input, category select, reset button, result count text, and empty state. Reuses CSS classes from `ScanCard.module.css`.

### Client boundary (`components/TechnologyCatalogView.tsx`)

`'use client'` component. Props: `{ technologies: TechnologyPresentation[] }`. Manages `search` and `category` state from URL via `useSearchParams()`, syncs to URL via `router.replace()`, delegates filtering to `filterTechnologies()`. Uses `buildTechnologyUrl()` (extracted to `technology-filter.ts` for testability).

### `/technologies` page (`app/technologies/page.tsx`)

Server component that calls `getTechnologies()` and passes the result to `<TechnologyCatalogView>`. Accepts `searchParams` as a prop (matching the `/scans` pattern) so the Next.js prerenderer knows the page depends on search params. Includes a "Back to scan history" Link in the footer.

## Files Created

- `apps/web/src/lib/technology-filter.ts` — Pure filtering: `filterTechnologies()`, `getTechnologyCategories()`, `isValidTechnologyCategory()`, `buildTechnologyUrl()`, `TechnologyFilters` interface
- `apps/web/src/lib/technology-filter.test.ts` — 20 tests (13 filtering + 4 category validation + 3 categories derived)
- `apps/web/src/components/TechnologyFilters.tsx` — Pure presentation component (search, category select, reset, result count, empty state)
- `apps/web/src/components/TechnologyFilters.test.tsx` — 8 UI tests
- `apps/web/src/components/TechnologyCatalogView.tsx` — Client component with URL state sync
- `apps/web/src/components/TechnologyCatalogView.test.tsx` — 8 URL state tests (5 URL building + 3 initialization)

## Files Modified

- `apps/web/src/app/technologies/page.tsx` — Changed to accept `searchParams`, delegate to `TechnologyCatalogView` client component
- `apps/web/src/components/TechnologyCatalogView.tsx` — Uses `buildTechnologyUrl` from `technology-filter.ts` (instead of inline `buildUrl`)
- `apps/web/src/components/TechnologyCatalog.test.tsx` — Updated mock for `next/navigation` (added `useRouter`/`useSearchParams`), updated rendering tests to handle async page

## Search Behavior

- Case-insensitive substring matching
- Search field across: `name`, `id`, `category`, `description`
- Empty search = no search filter (shows all technologies)
- No fuzzy search — simple substring only

## Category Behavior

- Categories derived from the catalog — no hardcoded list
- Exact match against technology `category` field
- Empty string (`All`) = no category filter
- Invalid category falls back to `All` (empty string) via `isValidTechnologyCategory()`

## URL Parameters

- `q` — search text (omitted when empty)
- `category` — category filter (omitted when empty/All)
- Both parameters are omitted when reset
- Example: `/technologies?q=react&category=library`

## Invalid-Filter Behavior

- Invalid `category` in URL → falls back to `All` (empty string), no error
- Empty `search` → no search filter applied
- No matches → "No technologies match your filters." message with reset button
- Empty state does not imply the catalog itself is empty

## Client/Server Boundary

- `/technologies` page: **server-rendered** (async server component)
- `TechnologyCatalogView`: **client component** (`'use client'`) — contains only the filter controls and list rendering
- `TechnologyFilters`: **pure component** (no client directive) — testable with `renderToString`
- `TechnologyCatalogView` is the minimal client boundary — `getTechnologies()` runs server-side, data is passed as props
- No client-side data fetching

## Test Coverage

### Pure filtering tests (`lib/technology-filter.test.ts`) — 14 tests

1. returns all technologies when no filters are applied
2. filters by name (case-insensitive substring)
3. filters by ID (case-insensitive)
4. filters by category (case-insensitive substring)
5. filters by description (case-insensitive substring)
6. search is case-insensitive
7. filters by category only
8. combines search and category filters
9. invalid category returns no matches (handled by caller normalization)
10. empty search returns all within category filter
11. returns empty array when no technologies match
12. preserves original ordering (does not re-sort)
13. does not mutate the input array
14. categories are derived uniquely and sorted from catalog data

### Category validation tests — 4 tests

1. returns true for a known category
2. returns false for an unknown category
3. returns false for empty string
4. returns false for null/undefined

### Category derivation tests — 2 tests

1. returns sorted unique categories from the actual catalog
2. returns empty array for empty input

### UI tests (`components/TechnologyFilters.test.tsx`) — 8 tests

1. controls render (search field, category select, labels)
2. search filters results (result count reflects filtered set)
3. category filters results (result count reflects category filter)
4. combined filters work (search + category narrow results)
5. result count is correct
6. reset button appears when filters are active
7. empty state appears when no matches
8. filtered IDs map to valid catalog routes (links remain correct)

### URL state tests (`components/TechnologyCatalogView.test.tsx`) — 8 tests

**URL building (5 tests):**

1. `q` parameter is included when search is set
2. `category` parameter is included when category is set
3. search updates URL when both search and category are set
4. invalid category is normalized before URL construction (empty = omitted)
5. reset removes unnecessary parameters (both empty = clean URL)

**Initialization (3 tests):**

6. `q` parameter initializes the search field from URL
7. `category` parameter initializes the category select from URL
8. invalid category resolves to All (empty select value)

## Validation Results

| Check                                                | Status  | Details                                            |
| ---------------------------------------------------- | ------- | -------------------------------------------------- |
| `pnpm typecheck`                                     | ✅ Pass | All 10 workspaces typecheck clean                  |
| `pnpm test`                                          | ✅ Pass | 1245 passed, 18 skipped (67 → 70 test files)       |
| `pnpm lint`                                          | ✅ Pass | ESLint clean, Prettier all files match code style  |
| `pnpm build`                                         | ✅ Pass | All packages build, including `apps/web`           |
| `npx madge --circular --extensions ts packages apps` | ✅ Pass | No circular dependency found (192 files processed) |

`tsconfig.json` `jsx: "preserve"` confirmed intact after build.

## Architectural Decisions

1. **No new API endpoint**: The catalog is available in-memory at build time. No `/api/technologies` endpoint was added.

2. **Minimal client boundary**: Only `TechnologyCatalogView` is a client component. The server page fetches all data via `getTechnologies()` and passes it as props — no client-side data fetching, no SWR/React Query.

3. **Pure filtering in a separate module**: `filterTechnologies()`, `getTechnologyCategories()`, `isValidTechnologyCategory()`, and `buildTechnologyUrl()` are pure functions in `lib/technology-filter.ts`, testable without React.

4. **Server page accepts `searchParams`**: The `/technologies` page accepts `searchParams` as a prop and awaits it (matching the `/scans` pattern), which tells Next.js the page depends on URL query params and avoids the "suspense boundary" prerendering error.

5. **Category validation is client-side**: The server page doesn't validate categories — `TechnologyCatalogView` uses `isValidTechnologyCategory()` in its `useState` initializer to normalize invalid categories to `All`.

6. **`buildTechnologyUrl` extracted for testability**: Pulled the URL-builder out of `TechnologyCatalogView.tsx` into `technology-filter.ts` so it can be unit-tested as a pure function without mocking `next/navigation`.

7. **Reused Step 27 patterns**: `TechnologyFilters` (pure presentation) + `TechnologyCatalogView` (client with URL sync) mirrors `ScanFilters` (`ScanHistory`) from Step 27. CSS classes reused from `ScanCard.module.css`.

8. **URL state tests mock `next/navigation`**: Tests mock `useRouter`, `useSearchParams`, and `notFound` from `next/navigation`, and mock `next/link` to render plain `<a>` tags.
