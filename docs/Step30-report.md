# Step 30: Technology Catalog & Detail UX

## Objective

Make detected technologies explorable and understandable from existing scan results. Introduce a small, deterministic technology catalog presentation layer and dedicated catalog UI, without changing the detector engine or detection behavior.

## Architecture

### Preferred structure

```
layout.tsx (server)
  ↓
page.tsx (server) — / (home, with technology catalog link)
  ↓
app/technologies/page.tsx (server) — catalog listing
  ↓
app/technologies/[id]/page.tsx (server) — technology detail + generateMetadata()
  ↓
DetectionItem.tsx (pure presentation) — links tech names to /technologies/{id}
```

All catalog pages are **server-rendered**. No client component boundaries are introduced for catalog pages (the only client components remain `ScanLifecycle`, `CopyReportLink`, and `ExportScanButton` from prior steps).

### Presentation model (`lib/technology-catalog.ts`)

Pure module wrapping the existing `TECHNOLOGY_CATALOG` from `@devlens/detectors`. The catalog in `@devlens/detectors` remains the single source of truth — this module adds **presentation-only** metadata (descriptions) that do not exist in the catalog and do **not** conflict with detector logic.

Exports:

- **`TechnologyPresentation`** interface — `{ id, name, category, description }`
- **`getTechnologies()`** — returns all catalog technologies as presentation entries (deterministic insertion-order)
- **`getTechnologyById(id)`** — looks up a technology by ID; returns `null` for unknown IDs
- **`getTechnologyDescription(id)`** — returns a concise factual description, falling back to a neutral default
- **`isKnownTechnology(id)`** — boolean check (used by `DetectionItem` to decide whether to render a link)

The `@devlens/detectors` `TECHNOLOGY_CATALOG` and `TECHNOLOGY_IDS` are imported directly — no duplication of the technology list.

### Description map

A small `TECHNOLOGY_DESCRIPTIONS` record in `technology-catalog.ts` provides concise factual descriptions (e.g., `'React — JavaScript library for building user interfaces'`). These are based strictly on the technology's known identity and category. Entries not present fall back to `'Detected by DevLens.'`.

### `/technologies` page

Server component (`app/technologies/page.tsx`) that calls `getTechnologies()` and renders a clean list of all technologies. Each entry shows:

- Technology name (linked to `/technologies/{id}`)
- Category (badge-style)
- Short description

Uses existing visual language — same `.main` / `.header` / `.title` / `.subtitle` layout as `/scans`.

### `/technologies/[id]` detail page

Server component (`app/technologies/[id]/page.tsx`) that:

- Calls `getTechnologyById(id)` for the requested technology
- Uses `notFound()` for unknown technology IDs (returns 404)
- Renders: technology name, category, description, technology ID
- Provides a "Back to catalog" link
- Has `generateMetadata()` — title is `DevLens — {Technology Name}` for known tech; generic "Not Found" title for unknown IDs (no arbitrary ID leakage)

### Detection item integration (`components/DetectionItem.tsx`)

Modified the existing `DetectionItem` component to conditionally link the technology name to `/technologies/{technology.id}` when the technology is known (via `isKnownTechnology()`). Unknown technology IDs render as plain text — no broken links.

This preserves all existing behavior: score/confidence display, detection ordering, evidence rendering, and accessibility.

### Navigation

No global navigation component exists. A contextual "Technology catalog" link was added to the home page (`app/page.tsx`) — a simple `<Link>` styled with the existing visual language. The catalog page also has a "Back to scan history" link, and detail pages link back to the catalog.

## Files Created

- `apps/web/src/lib/technology-catalog.ts` — Pure presentation layer (4 exports)
- `apps/web/src/lib/technology-catalog.test.ts` — 12 tests (catalog, lookup, immutability, descriptions)
- `apps/web/src/app/technologies/page.tsx` — Server component for `/technologies`
- `apps/web/src/app/technologies/page.module.css` — Styles for catalog list
- `apps/web/src/app/technologies/[id]/page.tsx` — Server component + `generateMetadata()`
- `apps/web/src/app/technologies/[id]/page.module.css` — Styles for detail page
- `apps/web/src/components/TechnologyCatalog.test.tsx` — 8 tests (catalog page, detail page, metadata, detection links)

## Files Modified

- `apps/web/src/components/DetectionItem.tsx` — Added conditional link to technology detail page
- `apps/web/src/components/ScanCard.module.css` — Added `.techNameLink` style
- `apps/web/src/app/page.tsx` — Added "Technology catalog" contextual link
- `apps/web/src/app/page.module.css` — Added `.techCatalogLink` style

## Test Coverage

### Catalog tests (`lib/technology-catalog.test.ts`) — 12 tests

1. `getTechnologies()` returns all catalog technologies (matches catalog key count)
2. entries contain id, name, category, and description fields
3. output is deterministic (same order every call)
4. IDs match catalog keys
5. `getTechnologyById()` finds valid IDs (e.g., "react" → "React")
6. `getTechnologyById()` returns null for unknown IDs
7. `getTechnologyById()` returns null for empty string
8. `isKnownTechnology()` returns true for known IDs
9. `isKnownTechnology()` returns false for unknown IDs
10. `isKnownTechnology()` returns false for empty string
11. caller mutation cannot corrupt the source catalog (immutability)
12. every catalog technology has a description

### UI tests (`components/TechnologyCatalog.test.tsx`) — 8 tests

**Catalog page:**

1. `/technologies` renders catalog entries (name, category, description visible)
2. technology entries link to the correct detail route (`/technologies/{id}` for every catalog key)

**Detail page:**

3. detail page renders known technology (name, category, description)
4. unknown technology triggers `notFound()`

**Detection links:**

5. known technology in detection links to the correct detail route
6. unknown technology IDs do not produce broken catalog links

**Metadata:**

7. `generateMetadata` produces `DevLens — {Technology Name}` for known technologies
8. unknown technology metadata does not leak arbitrary IDs

## Validation Results

| Check                                                | Status  | Details                                           |
| ---------------------------------------------------- | ------- | ------------------------------------------------- |
| `pnpm typecheck`                                     | ✅ Pass | All 10 workspaces typecheck clean                 |
| `pnpm test`                                          | ✅ Pass | 1193 passed, 18 skipped (up from 1185 + 20 new)   |
| `pnpm lint`                                          | ✅ Pass | ESLint clean, Prettier all files match code style |
| `pnpm build`                                         | ✅ Pass | All packages build, including `apps/web`          |
| `npx madge --circular --extensions ts packages apps` | ✅ Pass | No circular dependency found                      |

## Catalog Source of Truth

The `@devlens/detectors` package exports `TECHNOLOGY_CATALOG` — a `Record<string, Technology>` mapping catalog keys to `{ id, name, category }` objects. This catalog is the single source of truth for technology metadata. Step 30 does **not** duplicate it — `technology-catalog.ts` imports and wraps it, adding only `description` (a presentation-only field).

## Routes Added

- `GET /technologies` — Lists all catalog technologies
- `GET /technologies/[id]` — Technology detail page (404 for unknown IDs)

## Unknown-ID Behavior

- **Catalog page**: always lists only known technologies.
- **Detail page**: uses `notFound()` → 404 response.
- **Detection links**: if a scan's technology ID is not in the catalog, the name renders as plain text (no `<a>` tag, no broken link).
- **Metadata**: unknown IDs produce a generic "Not Found" title — the raw ID is never included in `<title>` or `<meta>` tags.

## Architectural Decisions

1. **No new API endpoint**: The catalog is available in-memory at build time. No `/api/technologies` endpoint was added — the catalog is read directly from the `@devlens/detectors` package.

2. **Presentation model is a thin wrapper**: `TechnologyPresentation` just adds a `description` field to the existing `Technology` shape. No new domain model, no new abstraction.

3. **Server-rendered pages only**: Both `/technologies` and `/technologies/[id]` are server components — no client component boundaries added for catalog pages.

4. **Conditional detection links**: `DetectionItem` checks `isKnownTechnology()` before rendering a link. Unknown IDs render as plain text — no broken links, no 404s from the detail page.

5. **Description map is presentation-only**: Descriptions live in `technology-catalog.ts` (web layer), not in the detectors package. This keeps detector logic clean and allows descriptions to evolve independently.

6. **Deterministic ordering**: `getTechnologies()` preserves the insertion order of `Object.keys(TECHNOLOGY_CATALOG)`, which is deterministic.

7. **No navigation redesign**: A simple contextual link was added to the home page — no new navigation architecture was introduced.
