# DevLens — Step 31: Technology Catalog Search & Filtering

## Goal

Extend the existing `/technologies` catalog with deterministic client-side search and category filtering.

The catalog source of truth remains the existing `@devlens/detectors` catalog wrapped by `lib/technology-catalog.ts`.

This is strictly a product/UI step.

Do not modify detectors, scoring, crawling, persistence, scan APIs, or technology definitions.

---

## 1. Inspect the existing implementation

Before modifying anything, inspect:

- `lib/technology-catalog.ts`
- `/technologies/page.tsx`
- `/technologies/[id]/page.tsx`
- existing catalog CSS/components
- `DetectionItem.tsx`
- Step 27 scan-history filtering implementation
- existing URL/query-state conventions

Reuse existing patterns where appropriate.

Do not duplicate the technology catalog.

---

## 2. Create pure filtering logic

Create:

```text
apps/web/src/lib/technology-filter.ts
```

Expose a small pure API, for example:

```ts
filterTechnologies(technologies, filters);
getTechnologyCategories(technologies);
isValidTechnologyCategory(category);
```

Define an appropriate filter type.

### Search

Search case-insensitively across:

- `name`
- `id`
- `category`
- `description`

Use simple substring matching.

Do not implement fuzzy search.

### Category

Categories must be derived from the existing catalog.

Do not maintain a second hardcoded category list.

The filter must:

- preserve original catalog order
- be deterministic
- not mutate the input
- support empty search
- support `All`
- safely handle an invalid category

---

## 3. Create the filter UI

Add a small client component:

```text
apps/web/src/components/TechnologyFilters.tsx
```

It should provide:

- search field
- category select
- reset button
- filtered result count

Keep it presentation-focused.

The component must not fetch data.

Do not turn the entire catalog page into a client component.

---

## 4. Keep `/technologies` server-rendered

Preserve the architecture:

```text
server page
    ↓
catalog from existing source
    ↓
client filter controls
    ↓
pure in-memory filtering
```

The browser must not request the catalog again.

No API endpoint is needed.

No React Query/SWR/state-management library.

---

## 5. Persist filters in the URL

Use:

```text
/technologies?q=react&category=library
```

Parameters:

- `q`
- `category`

Requirements:

- initial URL state populates the controls
- changing search updates the URL
- changing category updates the URL
- browser back/forward restores the state
- invalid category falls back to `All`
- empty search removes `q`
- `All` removes `category`
- do not create unnecessary query parameters

Follow the implementation style already established by `/scans`.

Avoid introducing a new URL-state abstraction.

---

## 6. Empty states

Handle:

### No matches

Display a clear message such as:

```text
No technologies match your filters.
```

Provide a reset action.

The empty state must not imply that the catalog itself is empty.

Do not alter the underlying catalog.

---

## 7. Preserve technology detail pages

Do not change the behavior of:

```text
/technologies/[id]
```

They must continue to:

- render known technologies
- return `notFound()` for unknown IDs
- generate safe metadata
- remain server-rendered

All existing catalog links must remain valid after filtering.

---

## 8. Accessibility

Ensure:

- search input has an accessible label
- category select has an accessible label
- reset button is keyboard accessible
- result count is understandable
- empty state is semantically appropriate
- technology links remain normal anchors

Do not add an accessibility dependency.

---

## 9. Tests

### Pure filtering

Test:

- empty filters return the full catalog
- search by name
- search by ID
- search by category
- search by description
- case-insensitive search
- category filtering
- combined search + category
- invalid category
- empty search
- no matches
- original ordering preserved
- input is not mutated
- categories are derived uniquely from catalog data

### UI

Test:

- controls render
- search filters results
- category filters results
- combined filters work
- result count is correct
- reset restores the complete catalog
- empty state appears
- links remain correct

### URL state

Test:

- `q` initializes search
- `category` initializes category
- search updates URL
- category updates URL
- invalid category resolves to `All`
- reset removes unnecessary parameters

Reuse the existing testing conventions from Step 27.

Do not introduce another testing framework.

---

## 10. Documentation

Create:

```text
docs/Step31-report.md
```

Document:

- objective
- files created/modified
- search behavior
- category behavior
- URL parameters
- client/server boundary
- invalid-filter behavior
- tests
- validation results
- architectural decisions

---

## Constraints

Do NOT:

- modify detector implementations
- modify technology IDs
- modify detector confidence
- modify scoring
- modify crawler behavior
- modify persistence
- modify scan API contracts
- add an API endpoint
- add database state
- add dependencies
- add a state-management library
- add a search library
- implement fuzzy search
- add pagination
- add sorting controls
- redesign technology detail pages
- duplicate catalog/category data
- fetch catalog data from the browser

Keep the scope strictly limited to catalog exploration.

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

All five must pass.

Also manually verify:

```text
/technologies
/technologies?q=react
/technologies?category=library
/technologies?q=react&category=library
/technologies?q=does-not-exist
```

Verify browser back/forward restores filter state.

---

## Success criteria

Step 31 is complete when:

- `/technologies` supports search
- `/technologies` supports category filtering
- search and category work together
- filter state is represented in the URL
- browser navigation restores filter state
- invalid filters fail safely
- filtering is deterministic and client-local
- catalog order remains stable
- the page remains server-rendered except for the minimal filter boundary
- technology detail pages remain unchanged
- no dependency is added
- tests cover filtering, UI, URL state and edge cases
- all five validation commands pass
- `docs/Step31-report.md` exists
