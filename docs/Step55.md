# DevLens — Step 55 — Scan Detail: Detection → Technology Exploration

## Context

Steps 44–54 are complete.

Current product surfaces:

- `/` — Home Dashboard
- `/scans/new` — scan creation
- `/scans` — scan history + filtering + comparison
- `/scans/{id}` — detailed scan result
- `/scans/compare` — scan comparison
- `/technologies` — technology catalog
- `/technologies/{id}` — technology detail + real detected scans
- Global application navigation

Current validated state:

- 1633 Vitest tests passed
- 18 skipped
- TypeScript passes
- ESLint passes
- Prettier passes
- Next build passes
- madge reports no circular dependencies

## Objective

Improve the scan detail experience by making detected technologies directly explorable.

Current relationship:

Technology Detail
→ "Detected in scans"
→ Scan Detail

Now implement the inverse navigation:

Scan Detail
→ Detection
→ Technology Detail

This should use the existing technology catalog and existing detection identity.

The goal is not to redesign Scan Detail.

The goal is to make detected technologies useful navigation targets.

---

# Step 0 — Inspect first

Inspect the existing scan detail implementation:

- `ScanDetailView`
- `DetectionList`
- `DetectionItem`
- detection response types
- `getDetectionExplainability()`
- technology catalog helpers
- `isKnownTechnology()`
- technology detail route
- existing links inside detection/evidence UI
- scan detail tests

Determine exactly where the technology name/identity is currently rendered.

Do not infer from filenames.

---

# Required behavior

## 1. Known technologies become links

For every detected technology that exists in the canonical technology catalog:

```text
Detection
  Technology Name
       ↓
/technologies/{technologyId}

Use Next.js <Link>.

Use the canonical technology ID.

Do not construct the route from the display name.

Do not introduce fuzzy matching.

2. Unknown technologies

If a detection contains a technology ID that is not present in the catalog:

keep the technology name as plain text
do not create a broken /technologies/... link
preserve the existing detection information

Use isKnownTechnology() or the canonical catalog helper already used elsewhere.

3. Preserve detection information

The new link must NOT replace or hide:

technology name
category
confidence
evidence count
explainability
existing evidence controls
existing detection status

Only make the technology identity navigable.

Do not duplicate detection rendering.

Reuse architecture

Prefer implementing the link at the lowest existing reusable presentation layer where it makes sense.

For example, if DetectionItem is shared by:

scan detail
comparison
other views

determine whether changing it globally is safe.

Do not accidentally alter comparison semantics.

If the component is reused in contexts where linking is undesirable, introduce the smallest explicit presentation prop necessary.

Avoid duplicating an entire DetectionItem just to add a link.

Accessibility

Technology links must:

have meaningful visible text
use normal keyboard navigation
have visible focus state
not rely solely on color
preserve the existing heading hierarchy

Do not add icons solely for decoration.

Technology detail continuity

Verify the resulting flow:

/scans/{id}
→ click detected technology
→ /technologies/{id}
→ "Detected in scans"
→ click another scan
→ /scans/{otherId}

This should create a real bidirectional exploration loop using existing data.

Do not implement special back-stack state or client-side routing state.

Normal browser/app navigation is sufficient.

Tests

Add focused tests covering:

known technology renders as a link
link points to /technologies/{id}
canonical technology ID is used
unknown technology remains plain text
detection information remains visible
confidence/evidence information remains intact
multiple technologies produce correct links
existing scan detail rendering remains valid
technology detail route remains reachable from scan detail
existing comparison behavior is not unintentionally changed

Prefer testing pure helpers separately where appropriate.

Do not write brittle CSS tests.

Scope constraints

This step MUST NOT modify:

detection algorithms
crawler
scoring
evidence generation
comparison semantics
technology catalog definitions
persistence
scan execution
API contracts

Do not add:

analytics
technology popularity metrics
charts
recommendations
"related technologies"
ranking
new navigation systems
new dependencies

Do not redesign the scan detail page.

This is a navigation/data-discoverability increment.

Important implementation rule

Before editing shared components, determine every current consumer.

If a shared component is modified:

verify all consumers
preserve existing rendering semantics
add regression tests for the contexts affected

Do not blindly modify a shared component.

Validation

Run:

targeted scan-detail/detection tests
any technology-link helper tests
full Vitest suite
tsc --noEmit
ESLint
Prettier
next build
madge circular dependency check

Verify the complete navigation chain if fixtures/data allow:

Scan → Technology → Scan

Final report

Report:

Inspection
where detection technology is currently rendered
which components consume it
whether a shared component was changed
Implementation
files changed
known/unknown technology behavior
route construction
accessibility
Tests
new tests
regression coverage
full suite result
Validation
typecheck
lint
formatting
build
madge
Scope

Explicitly confirm that detector, crawler, scoring, evidence generation, comparison semantics, persistence, and API contracts were untouched.

Do NOT proceed automatically to Step 56.