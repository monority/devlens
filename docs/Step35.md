# DevLens — Step 35: Technology Evidence Matrix

## Goal

Add a compact **Technology Evidence Matrix** to completed scan reports.

The matrix should provide a global view of:

- which detected technologies have which evidence types
- how much evidence supports each technology
- which evidence categories are present for each technology

This is a **presentation-level aggregation of existing detection evidence**.

Do NOT infer dependencies, compatibility, causality, confidence meaning, implementation architecture, or relationships between technologies.

---

## 1. Inspect before changing

Inspect the existing implementation and tests from Steps 25–34:

- `apps/web/src/lib/scan-insights.ts`
- `apps/web/src/lib/detection-explanation.ts`
- `apps/web/src/components/ScanInsights.tsx`
- `apps/web/src/components/DetectionItem.tsx`
- `apps/web/src/components/DetectionList.tsx`
- `apps/web/src/lib/evidence-presenter.ts`
- `apps/web/src/lib/technology-catalog.ts`
- `apps/web/src/components/ScanInsights.test.tsx`
- `apps/web/src/lib/scan-insights.test.ts`
- relevant scan detail CSS

Reuse existing domain/API contracts and presentation mappings.

Do not create a second evidence model.

---

## 2. Pure evidence matrix model

Add a small pure presentation model, preferably in `scan-insights.ts` if that remains cohesive, otherwise create a narrowly scoped companion module.

Suggested types:

```ts
type TechnologyEvidenceMatrixItem = {
  id: string;
  name: string;
  evidenceTypes: string[];
  evidenceCount: number;
};

type TechnologyEvidenceMatrix = TechnologyEvidenceMatrixItem[];
```

Derive this exclusively from the existing `Detection[]`.

For every detection:

- preserve technology ID
- preserve technology display name
- derive evidence types from the detection's existing evidence
- use the existing `evidenceTypeLabel()` mapping
- remove duplicate evidence types for the matrix
- count the actual evidence entries separately

The matrix must not recalculate detection confidence.

Do not modify `Detection`, `Evidence`, or detector contracts.

---

## 3. Deterministic behavior

The output must be:

- pure
- synchronous
- deterministic
- immutable
- React-independent
- browser-independent
- network-independent

Ordering:

1. technology name ASC
2. technology ID ASC

Evidence type labels:

- deterministic
- alphabetical ASC
- duplicates removed

`evidenceCount` is the number of actual evidence entries attached to that detection.

If a detection has no evidence:

```ts
evidenceTypes: [];
evidenceCount: 0;
```

Unknown evidence types must use the existing `"Evidence"` fallback.

Unknown technology IDs must remain supported.

Do not mutate the input detections.

---

## 4. Duplicate technology handling

The matrix represents technologies, not individual detection records.

If duplicate detection records for the same technology ID exist:

- collapse them into one matrix row
- preserve the first occurrence's technology name
- merge their evidence
- deduplicate evidence entries using the existing canonical evidence identity where appropriate
- derive unique evidence types from the merged evidence
- calculate `evidenceCount` from the merged evidence

Do not alter the actual `detections` array or existing deduplication behavior.

The matrix is presentation-only.

---

## 5. UI

Add a compact section to the completed scan report, preferably inside `ScanInsights`.

Suggested title:

**Technology evidence**

Possible column/row labels:

| Technology | Evidence | Sources |
| ---------- | -------- | ------- |

Where:

- Technology = technology name
- Evidence = evidence type labels
- Sources = number of evidence entries

Keep the UI consistent with the existing ScanInsights visual language.

Known technologies:

- link to `/technologies/{id}`

Unknown technologies:

- plain text

Evidence labels must reuse the existing presenter.

Avoid introducing a large table that becomes awkward on mobile. A responsive list/grid is acceptable if it communicates the same matrix information.

The section should remain compact and scannable.

---

## 6. Empty and lifecycle states

The matrix should only appear for completed scans, consistent with existing `ScanInsights`.

Do not render it for:

- pending
- running
- failed

For a completed scan with zero detections, preserve the existing empty-state behavior.

Do not introduce fake evidence or placeholder rows.

---

## 7. Accessibility

Use semantic HTML.

Requirements:

- technology names remain accessible links when known
- evidence labels are readable by screen readers
- do not rely exclusively on color
- preserve keyboard navigation
- no unnecessary client-side state

Prefer server-rendered/pure presentation behavior.

---

## 8. Tests

Add pure tests covering at minimum:

1. one technology with one evidence item
2. one technology with multiple evidence types
3. multiple technologies
4. duplicate technology IDs
5. merged evidence from duplicate IDs
6. duplicate evidence
7. no evidence
8. unknown technology ID
9. unknown evidence type
10. deterministic ordering
11. immutability
12. empty input

Add component tests covering:

1. matrix renders
2. technology names link correctly
3. unknown technologies remain plain text
4. evidence labels render correctly
5. evidence count renders correctly
6. multiple technologies render
7. empty completed scan
8. failed scan
9. pending scan
10. existing composition/explanation/evidence UI remains intact

Do not weaken or remove existing tests.

---

## 9. Documentation

Create:

```text
docs/Step35-report.md
```

Document:

- objective
- implementation
- data flow
- duplicate handling
- evidence counting
- deterministic ordering
- UI behavior
- accessibility
- tests
- validation results
- explicit non-goals

Mention clearly that the matrix is a **descriptive presentation of existing evidence**, not an inference engine.

---

## 10. Scope constraints

Do NOT:

- modify detectors
- modify scoring
- modify crawler behavior
- modify persistence
- modify API contracts
- add an API endpoint
- add database fields
- add external metadata
- add AI/LLM analysis
- infer technology dependencies
- infer compatibility
- infer causality
- infer architecture
- create a second technology catalog
- create a second evidence mapping
- add dependencies
- add client-side state unless strictly necessary

Reuse existing:

- detection model
- evidence model
- evidence presenter
- technology catalog
- ScanInsights architecture
- existing CSS conventions

---

## 11. Validation

Run:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps
```

Also verify:

```text
jsx: "preserve"
```

Expected:

- all existing tests remain green
- new tests pass
- typecheck passes
- lint passes
- build passes
- no circular dependencies

---

## 12. Final report

At completion report:

1. files created
2. files modified
3. evidence matrix model
4. duplicate handling
5. UI behavior
6. tests added
7. validation results
8. git commit hash

Do not push to GitHub unless credentials are available.

Keep the implementation narrowly scoped to Step 35.
