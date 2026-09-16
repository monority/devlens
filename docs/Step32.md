# DevLens — Step 32: Technology Usage Insights

## Goal

Improve the scan report by making detected technologies easier to understand at a glance.

For each detected technology, expose concise usage context derived exclusively from the existing scan result:

- technology
- category
- confidence/score
- number of evidence items
- evidence source types

Add a compact summary section to completed scan reports showing the overall technology composition of the scan.

This is a presentation/product step.

Do not modify detection, scoring, crawling, persistence, or API contracts.

---

## 1. Inspect the existing scan result model

Before modifying anything, inspect:

- `ScanDetailResponse`
- `DetectionItem`
- `DetectionList`
- `ScanSummary`
- evidence presenter
- technology catalog presentation layer
- existing comparison implementation
- existing scan detail CSS

Reuse the current API response as the only source of scan data.

Do not introduce a second scan-result model.

---

## 2. Create a pure insights module

Create:

```text
apps/web/src/lib/scan-insights.ts
```

Expose a small pure API, for example:

```ts
getScanInsights(scan);
getEvidenceTypeCounts(detection);
getCategoryCounts(detections);
```

Use the exact existing response types.

The module should derive presentation data such as:

```ts
{
  technologyCount,
  evidenceCount,
  categoryCount,
  categories: [
    {
      category,
      count
    }
  ],
  evidenceTypes: [
    {
      type,
      count
    }
  ]
}
```

Keep the model minimal.

Do not add statistics that cannot be directly derived from the existing response.

---

## 3. Evidence source analysis

For each detection, count unique evidence source types.

Examples:

```text
HTTP Header
Meta Tag
Script URL
Script Content
Resource
Link
HTML
JavaScript Global
```

Use the existing evidence type contract/presenter.

Do not infer new evidence categories.

Do not count duplicated evidence objects twice if the same canonical evidence is already represented multiple times.

Prefer the existing detection/evidence semantics over implementing a second deduplication algorithm.

---

## 4. Category summary

Derive technology category counts from the existing technology catalog.

Example:

```text
CMS             3
Analytics       2
Framework       1
CDN             1
```

Important:

- use the catalog as the category source
- do not duplicate category definitions
- unknown technology IDs must be handled safely

For unknown technology IDs:

- keep the detection in the total technology count
- do not invent a category
- represent its category as `Unknown` only at the presentation layer if needed

---

## 5. Create a compact insights component

Create:

```text
apps/web/src/components/ScanInsights.tsx
```

The component should remain presentation-only.

It should display:

### Technology count

Example:

```text
7 technologies detected
```

### Category composition

A compact list such as:

```text
CMS · 3
Analytics · 2
Framework · 1
CDN · 1
```

### Evidence coverage

Example:

```text
5 evidence sources
```

Keep the visual hierarchy restrained.

Do not create a dashboard.

Do not introduce charts.

Do not introduce graphs.

Do not introduce progress bars.

A semantic list is sufficient.

---

## 6. Integrate into the scan detail page

Place the insights section near the existing:

```text
ScanSummary
```

The information should complement, not duplicate, the detection list.

Only display meaningful insight data.

For a completed scan with zero detections, render a concise empty state instead of misleading statistics.

For failed scans:

- do not fabricate insights
- preserve the existing failed-scan presentation

For pending/running scans:

- do not display completed-scan insights
- preserve existing polling/status UI

---

## 7. Technology links

Reuse the Step 30 technology catalog.

Where the technology is known:

```text
Technology → /technologies/{id}
```

Do not create another technology lookup implementation.

Unknown technology IDs remain plain text.

---

## 8. Metadata and semantics

Use semantic HTML:

- headings
- lists
- definition lists where appropriate

Do not rely on visual styling to communicate counts.

Ensure screen readers can understand:

- number of technologies
- category counts
- evidence coverage

No accessibility dependency.

---

## 9. Tests

### Pure insights tests

Cover:

- completed scan with multiple technologies
- zero detections
- one detection
- multiple detections in same category
- multiple categories
- unknown technology ID
- evidence counts
- multiple evidence types
- duplicate evidence behavior
- deterministic ordering
- input immutability

### Component tests

Cover:

- technology count
- category counts
- evidence summary
- empty detection state
- failed scan
- pending/running scan
- known technology links
- unknown technology rendering

Reuse existing test conventions.

Do not introduce a new testing framework.

---

## 10. Deterministic ordering

All derived lists must have explicit deterministic ordering.

Recommended:

### Categories

```text
count DESC
category ASC
```

### Evidence types

```text
count DESC
type ASC
```

### Ties

Always resolve alphabetically.

Do not rely on object insertion order.

---

## 11. Performance

This is a small in-memory derivation.

Do not introduce:

- memoization libraries
- caching layers
- database queries
- API requests
- asynchronous processing

The calculation should happen from the already-loaded scan result.

---

## Constraints

Do NOT:

- modify detectors
- modify scoring
- modify crawler behavior
- modify persistence
- modify API response contracts
- add API endpoints
- add database fields
- change scan lifecycle
- add dependencies
- add charts
- add analytics tracking
- add recommendations
- add popularity data
- add external technology metadata
- add a second catalog
- change detection ordering
- change confidence values

Do not alter the underlying scan result.

This step is strictly a derived presentation layer.

---

## Documentation

Create:

```text
docs/Step32-report.md
```

Document:

- objective
- insight calculations
- category derivation
- evidence aggregation
- unknown technology handling
- deterministic ordering
- UI integration
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

1. completed scan with detections
2. completed scan with zero detections
3. failed scan
4. pending/running scan
5. scan containing several technology categories
6. scan containing multiple evidence types
7. clicking a known technology from the insights/detection UI

---

## Success criteria

Step 32 is complete when:

- scan reports expose useful derived technology insights
- category composition is visible
- evidence coverage is visible
- all values derive exclusively from existing scan data/catalog
- unknown technology IDs remain safe
- deterministic ordering is guaranteed
- failed/pending/running scans are not misrepresented
- no API/domain/detector changes are required
- no dependencies are added
- tests cover the pure calculations and UI
- all five validation commands pass
- `docs/Step32-report.md` exists
