# DevLens — Step 33: Detection Explanation & Confidence Breakdown

## Goal

Make individual technology detections easier to understand.

The current scan report already exposes:

- technology
- category
- confidence/score
- evidence
- evidence source types

Step 33 should turn this existing information into a concise explanation of **why DevLens detected the technology**.

This is a presentation-layer feature.

Do not modify detector logic, scoring, evidence generation, crawler behavior, persistence, or API contracts.

---

## 1. Inspect the existing implementation

Before modifying anything, inspect:

- `DetectionItem.tsx`
- `DetectionList.tsx`
- `EvidenceList.tsx`
- `EvidenceItem.tsx`
- `evidence-presenter.ts`
- `scan-insights.ts`
- technology catalog presentation layer
- existing confidence/scoring tests
- current scan detail CSS

Reuse existing types and presentation helpers.

Do not create another evidence model.

---

## 2. Create a pure explanation module

Create:

```text id="k5y4z8"
apps/web/src/lib/detection-explanation.ts
```

Expose a pure function such as:

```ts
getDetectionExplanation(detection);
```

The returned presentation model should contain only information derivable from the detection itself.

For example:

```ts id="x1n3vk"
{
  summary: string,
  confidence: number,
  evidenceCount: number,
  evidenceTypes: string[],
}
```

The exact shape should follow the existing project types.

Do not hardcode technology-specific detection claims such as:

```text
"React was detected because ReactDOM was found"
```

unless that information can be directly derived from the actual evidence.

The explanation must never claim evidence that does not exist.

---

## 3. Confidence explanation

The existing score/confidence should remain authoritative.

Do not recalculate the score.

Do not duplicate `ConfidenceScorer`.

Instead, expose the existing numeric value together with a neutral explanation of its evidence coverage.

For example:

```text
Confidence: 95
Evidence: 2 sources
```

If the existing UI distinguishes confidence from final score, preserve that distinction.

Do not introduce labels such as:

- excellent
- poor
- likely
- unlikely
- high quality

unless such labels already exist in the domain contract.

This feature should explain the data, not reinterpret it.

---

## 4. Evidence-source summary

Derive the evidence source types from the detection's actual evidence.

Example:

```text
Detected from:

HTTP Header
Script URL
```

Use the existing `evidenceTypeLabel()` presenter.

Requirements:

- unique evidence types
- deterministic ordering
- no mutation
- no duplicated source labels

Use a stable ordering.

Prefer the canonical evidence type order already established by the project if one exists.

Otherwise use alphabetical ordering.

---

## 5. Human-readable explanation

Generate a concise neutral summary.

Examples of acceptable structure:

```text
Detected from 2 evidence sources.
```

or:

```text
Detected from HTTP Header and Script URL evidence.
```

The summary must be derived from actual evidence.

For zero evidence:

```text
No evidence details are available.
```

Do not invent a reason.

---

## 6. Integrate into `DetectionItem`

Update the existing detection presentation.

The result should remain compact.

Example conceptual structure:

```text
React                         95
JavaScript framework

Detected from 2 evidence sources
HTTP Header · Script URL

▸ Evidence
```

The exact visual design should follow the existing UI.

Do not redesign the entire detection list.

Do not remove the existing evidence disclosure.

The explanation should complement the evidence list.

---

## 7. Preserve existing behavior

Existing behavior must remain intact:

- technology links
- detection ordering
- confidence/score
- evidence expansion
- all eight evidence types
- unknown evidence fallback
- unknown technology fallback
- accessibility
- SSR behavior

Do not change the scan API response.

Do not change the detection domain model.

---

## 8. Optional confidence visualization

If the existing visual language supports it naturally, a very small non-interpretive visual indicator may be added.

For example:

```text
95 / 100
```

or a simple meter whose value is exactly the existing score.

Do NOT introduce:

- charts
- gauges
- animated meters
- gradients
- color-coded judgment
- new scoring semantics

Numeric confidence remains the authoritative representation.

If a visual indicator complicates the implementation, omit it.

---

## 9. Tests

### Pure explanation tests

Cover:

- one evidence type
- multiple evidence types
- duplicate evidence types
- zero evidence
- deterministic ordering
- correct evidence count
- correct confidence value
- unknown evidence type
- input immutability
- no invented evidence

### Component tests

Cover:

- explanation rendered
- confidence preserved
- evidence-source summary rendered
- zero-evidence behavior
- known technology link preserved
- unknown technology remains safe
- existing evidence disclosure still works
- all evidence types remain renderable

Reuse existing testing conventions.

Do not add a new test framework.

---

## 10. Accessibility

Ensure:

- explanation text is associated with its detection
- confidence is understandable without visual styling
- evidence-source summary is readable by screen readers
- existing disclosure remains keyboard accessible
- links remain semantic anchors

Do not add an accessibility dependency.

---

## 11. Determinism

The explanation must be a pure function.

Given the same detection:

```text
getDetectionExplanation(detection)
```

must always return the same result.

Do not use:

- current time
- random values
- locale-dependent formatting
- object insertion order
- network data

---

## Constraints

Do NOT:

- modify detector implementations
- modify detector confidence values
- modify `ConfidenceScorer`
- modify deduplication
- modify crawler behavior
- modify persistence
- modify API contracts
- add API endpoints
- add dependencies
- add analytics
- add charts
- add AI-generated explanations
- add technology-specific heuristics
- invent evidence
- change detection ordering
- change evidence semantics
- create a second evidence model

Keep this strictly as a derived presentation/explainability layer.

---

## Documentation

Create:

```text id="z7f2a1"
docs/Step33-report.md
```

Document:

- objective
- explanation model
- evidence-source derivation
- confidence handling
- UI integration
- unknown/empty evidence behavior
- determinism
- tests
- validation results

---

## Validation

Run:

```bash id="3m9f0q"
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps
```

All five must pass.

Manually verify:

1. completed scan with one detection
2. completed scan with multiple evidence types
3. completed scan with multiple technologies
4. detection with unknown technology ID
5. detection with unknown evidence type
6. zero-evidence detection
7. existing evidence disclosure
8. technology catalog links

---

## Success criteria

Step 33 is complete when:

- every detection can explain its evidence coverage
- the displayed confidence remains exactly the existing value
- evidence-source summaries derive only from real evidence
- no evidence is invented
- existing evidence details remain available
- known technology links continue working
- unknown values remain safe
- explanation output is deterministic
- no domain/detector/API changes are required
- no dependencies are added
- tests cover explanation and UI behavior
- all five validation commands pass
- `docs/Step33-report.md` exists
