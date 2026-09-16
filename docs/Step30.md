# DevLens — Step 30: Technology Catalog & Detail UX

## Goal

Make detected technologies explorable and understandable from the existing scan results.

The scan result currently identifies technologies with IDs, names/categories, confidence and evidence. Step 30 should introduce a small, deterministic technology catalog presentation layer and a dedicated catalog UI, without changing the detector engine or detection behavior.

The goal is product discoverability and explainability — not another detection-engine refactor.

---

## Scope

Implement:

1. A public technology catalog presentation model.
2. A `/technologies` catalog page.
3. A `/technologies/[id]` detail page.
4. Links from scan detections to the corresponding technology detail page.
5. Clear handling of unknown/invalid technology IDs.
6. Tests and documentation.

Use the existing centralized technology catalog as the source of truth.

---

## Step 1 — Audit the existing catalog

Before modifying anything, inspect:

- `@devlens/detectors` technology catalog
- technology/domain types
- existing detector metadata
- existing scan response types
- existing scan detection UI
- existing routing conventions
- existing CSS/design conventions

Do not duplicate the technology list manually.

The existing catalog must remain the authoritative source.

---

## Step 2 — Create a presentation-safe technology model

Create a pure presentation/query module in the web application, for example:

```text
apps/web/src/lib/technology-catalog.ts
```

Expose functions along the lines of:

```ts
getTechnologies()
getTechnologyById(id)
getTechnologyDescription(...)
```

Use the existing catalog data.

The returned presentation model should contain only information appropriate for the public UI, such as:

```ts
{
  (id, name, category, description);
}
```

If the existing catalog already contains suitable descriptive metadata, reuse it.

If descriptions do not exist, add a small explicit presentation description map rather than polluting detector logic.

Descriptions must be factual and concise.

Do NOT expose:

- detector implementation details unnecessarily
- internal module paths
- database details
- crawler internals
- scoring implementation
- environment information

The catalog functions must be:

- pure
- deterministic
- immutable from the caller's perspective
- independently testable

---

## Step 3 — `/technologies`

Create:

```text
/apps/web/src/app/technologies/page.tsx
```

Display all catalog technologies.

Each item should show at minimum:

- technology name
- category
- short description
- link to `/technologies/[id]`

Use the existing application visual language.

Keep the page technical and restrained.

Do NOT introduce:

- dashboards
- charts
- gradients
- excessive cards
- animations
- external UI libraries

If the catalog is large, use a clean grouped/list presentation rather than a visually heavy grid.

---

## Step 4 — Technology detail page

Create:

```text
/apps/web/src/app/technologies/[id]/page.tsx
```

Display:

- technology name
- category
- description
- technology ID
- link back to `/technologies`

Use `notFound()` for an unknown technology ID.

The page must be server-rendered.

Add `generateMetadata()` so the page has a meaningful title such as:

```text
DevLens — React
```

Do not put implementation internals into metadata.

---

## Step 5 — Connect scan results to technologies

Modify the existing detection result presentation so the technology name links to:

```text
/technologies/{technology.id}
```

The link must preserve all existing:

- score/confidence display
- detection ordering
- evidence rendering
- accessibility
- semantics

Do not change detection data or ranking.

If an API response contains a technology ID that is not currently present in the catalog, preserve the existing detection rendering and do not create a broken link.

---

## Step 6 — Navigation

Add a minimal navigation entry to the existing relevant application navigation/header if one exists.

Expected destination:

```text
/technologies
```

Do not redesign the global navigation.

If there is no appropriate global navigation abstraction, prefer a simple contextual link rather than introducing a new navigation architecture.

---

## Step 7 — Tests

Add focused tests.

### Catalog tests

Cover:

- all catalog technologies are returned
- IDs are unique
- `getTechnologyById()` finds valid IDs
- unknown IDs return `null`/`undefined`
- catalog output is deterministic
- caller mutation cannot corrupt the source catalog
- descriptions are present for every exposed technology

### UI tests

Cover:

- `/technologies` renders catalog entries
- technology entries link to the correct detail route
- detail page renders known technology
- unknown technology triggers `notFound`
- detection technology links to the correct detail route
- unknown detection IDs do not produce broken catalog links

Reuse the existing test strategy used by the web application.

Do not introduce a new testing framework.

---

## Step 8 — Metadata

Add metadata tests where practical.

Verify:

```text
DevLens — {Technology Name}
```

for known technology pages.

Ensure unknown technology metadata does not leak arbitrary user-controlled IDs.

---

## Step 9 — Documentation

Create:

```text
docs/Step30-report.md
```

Document:

- objective
- files created/modified
- catalog source of truth
- presentation model
- routes added
- scan-result integration
- unknown-ID behavior
- tests
- validation results
- architectural decisions

---

## Architectural constraints

Do NOT:

- modify detector signatures
- modify detector confidence values
- modify scoring
- modify deduplication
- modify crawler behavior
- modify persistence
- modify scan API contracts
- add database tables
- add a technology API endpoint unless strictly required by the existing architecture
- duplicate the technology catalog
- add external dependencies
- add client-side state for catalog pages
- add search/filtering yet
- add technology logos/images yet
- add charts or analytics
- add recommendations
- add "similar technologies"
- add technology popularity statistics

The existing catalog remains the single source of truth.

---

## Important implementation rule

Do not invent catalog metadata that conflicts with the existing domain.

If a technology's description cannot be safely derived from existing information, write a short neutral factual description based only on the technology's known identity/category.

Keep the presentation layer separate from detector behavior.

---

## Validation

Run exactly:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps
```

All must pass.

Also verify manually, if practical:

1. `/technologies`
2. `/technologies/react`
3. `/technologies/nonexistent`
4. an existing scan detail page
5. clicking a detected technology
6. a scan containing multiple technologies

---

## Success criteria

Step 30 is complete when:

- `/technologies` exposes the complete existing technology catalog
- every catalog technology has a stable detail route
- detail pages handle invalid IDs correctly
- scan detections link to their catalog entries
- unknown detection IDs remain safe and renderable
- no detection/scoring/crawler behavior changes
- no duplicate technology source of truth exists
- no new dependencies are introduced
- tests cover catalog and routing behavior
- all five repository validation commands pass
- `docs/Step30-report.md` documents the implementation
