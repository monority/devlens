# DevLens — Step 34: Technology Composition & Coexistence Insights

## Goal

Add a compact "technology composition" section to completed scan reports showing how detected technologies coexist within the same scan.

This feature must remain strictly descriptive.

It should answer:

- Which technology categories are represented?
- How many technologies are present in each category?
- Which technologies coexist in the scan?
- Are there multiple technologies from the same category?

Do NOT infer dependencies, compatibility, causality, architecture, or relationships that are not explicitly represented by the scan result.

This is a presentation/analysis layer only.

---

## 1. Inspect the existing implementation

Before modifying anything, inspect:

- `lib/scan-insights.ts`
- `ScanInsights.tsx`
- `DetectionItem.tsx`
- `DetectionList.tsx`
- `technology-catalog.ts`
- existing technology category handling
- existing scan detail layout/CSS
- existing tests from Steps 30–33

Reuse existing helpers and types.

Do not create a second technology catalog.

---

## 2. Extend the pure insights model

Extend `lib/scan-insights.ts`, or create a narrowly scoped companion module if that is cleaner.

Add a derived structure representing technology composition.

For example:

```ts
type TechnologyCategoryComposition = {
  category: string;
  technologies: TechnologyCompositionItem[];
};

type TechnologyCompositionItem = {
  id: string;
  name: string;
};
```

The exact names/types may follow the existing conventions.

The composition must be derived entirely from the existing scan response and technology catalog.

---

## 3. Category composition

For every detected technology:

1. Resolve its catalog metadata.
2. Determine its category.
3. Group technologies by category.
4. Keep unknown technologies safe.

Example:

```text
CMS
  WordPress
  Drupal
  PrestaShop

Analytics
  Google Analytics
  Plausible

CDN
  Cloudflare
```

Do not infer relationships between these technologies.

The fact that two technologies appear together means only that they were both detected in the same scan.

---

## 4. Deterministic ordering

All ordering must be explicit.

### Categories

Order by:

```text
technology count DESC
category ASC
```

### Technologies inside a category

Order by:

```text
technology name ASC
technology id ASC
```

Use the ID as a deterministic tie-breaker.

Do not rely on:

- object insertion order
- detector order
- database order
- browser order

---

## 5. Unknown technologies

If a detection contains an unknown technology ID:

- preserve it in the total detection/technology count
- place it in an `"Unknown"` presentation category
- display its original technology name if available
- do not create a catalog entry
- do not generate a technology link

Do not fail the entire composition because of one unknown technology.

---

## 6. Avoid duplicate technologies

The composition represents detected technologies, not raw detection rows.

If the same technology somehow appears more than once:

```text
React
React
```

it should appear once inside its category.

Use the stable technology ID as the identity.

Do not modify the underlying detection list.

---

## 7. Add a composition UI

Update:

```text
components/ScanInsights.tsx
```

or create a small dedicated component if that keeps responsibilities clearer.

Display a compact section such as:

```text
Technology composition

CMS · 3
  Drupal
  PrestaShop
  WordPress

Analytics · 2
  Google Analytics
  Plausible
```

Known technologies must link to:

```text
/technologies/{id}
```

Unknown technologies remain plain text.

Keep the existing insights UI intact.

Do not turn this into a dashboard.

---

## 8. Relationship wording

Be precise with language.

Allowed:

```text
Technologies detected together
Technology composition
Detected technologies by category
```

Avoid:

```text
Technology stack
Dependencies
Built with
Powered by
Compatible technologies
Technology relationships
Architecture
```

unless the wording is demonstrably supported by the underlying data.

The scan detects technologies; it does not prove how they are architecturally related.

---

## 9. Empty states

For a completed scan with zero detections:

Do not render a misleading composition.

Reuse the existing empty-state behavior.

For failed/pending/running scans:

Do not render composition data.

Preserve the behavior established in Step 32.

---

## 10. Pure function requirements

The composition calculation must be:

- pure
- deterministic
- synchronous
- immutable
- independent of React
- independent of browser APIs
- independent of network
- independent of persistence

Same scan input must always produce exactly the same composition.

---

## 11. Tests

Add pure tests covering:

- multiple categories
- one category
- multiple technologies in one category
- multiple technologies across categories
- duplicate technology IDs
- unknown technology IDs
- unknown technology names
- empty detections
- deterministic category ordering
- deterministic technology ordering
- input immutability
- known catalog links/data
- no inferred relationships

Add component tests covering:

- composition section renders
- category grouping
- technology names render
- known technology links
- unknown technology rendering
- empty state
- failed/pending/running behavior
- coexistence wording remains descriptive

Reuse the existing test framework and conventions.

---

## 12. Preserve existing insights

Do not remove or change the existing:

- technology count
- category counts
- evidence coverage
- detection explanations
- evidence tree
- confidence values
- detection ordering

The new composition is additional derived information.

---

## Constraints

Do NOT:

- modify detector implementations
- modify scoring
- modify confidence values
- modify evidence generation
- modify crawler behavior
- modify persistence
- modify API contracts
- add API endpoints
- add database fields
- add dependencies
- add AI/LLM analysis
- infer dependencies
- infer compatibility
- infer framework relationships
- infer technology architecture
- add external technology metadata
- change the catalog source of truth
- change detection ordering

Do not introduce a second representation of technology identity.

---

## Documentation

Create:

```text
docs/Step34-report.md
```

Document:

- objective
- composition model
- category grouping
- duplicate handling
- unknown technology handling
- deterministic ordering
- UI integration
- explicit non-inferences
- tests
- validation results

---

## Validation

Run:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps
```

All five must pass.

Manually verify:

1. scan with one technology
2. scan with multiple technologies in one category
3. scan with multiple categories
4. scan with duplicate technology IDs
5. scan containing an unknown technology ID
6. zero-detection scan
7. failed scan
8. technology links
9. existing evidence/explanation UI remains intact

---

## Success criteria

Step 34 is complete when:

- completed scan reports show technology composition
- technologies are grouped by catalog category
- duplicate technology IDs are collapsed only in the composition view
- unknown technologies are safe
- known technologies link to their catalog pages
- ordering is deterministic
- wording remains purely descriptive
- no relationships/dependencies are inferred
- existing insights and detection explanations remain unchanged
- no API/domain/detector changes are required
- no dependencies are added
- tests cover pure composition and UI behavior
- all five validation commands pass
- `docs/Step34-report.md` exists
