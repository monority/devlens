# Step 81 — Detection Result Integrity

## 0. Goal

Harden the semantic consistency of the final DevLens detection result.

Steps 79 and 80 added two important derived layers:

```text
Observation
    ↓
Detection
    ↓
Deduplication
    ↓
Quality
    ↓
Provenance
    ↓
API / UI
```

Step 79 tells us how trustworthy the scan result is at scan level.

Step 80 tells us what evidence supports an individual detection.

Step 81 must ensure that these derived representations remain **internally consistent**.

The objective is not to create another scoring system.

The objective is to establish deterministic invariants around the final detection result and expose only factual integrity information when useful.

---

# 1. Product principle

A DevLens result must never contradict its own underlying data.

For every final detection:

```text
Detection identity
    ↕
Evidence
    ↕
Provenance
    ↕
Confidence / quality
```

must remain coherent.

At scan level:

```text
Observation coverage
    ↕
Scan quality
    ↕
Detection results
```

must also remain coherent.

The user should never encounter a result where:

* provenance says there are signals but the detection has none;
* evidence count differs from the actual final evidence collection;
* evidence types contradict the evidence objects;
* a detection references evidence that disappeared during mapping;
* a derived detection is accidentally presented as directly observed;
* API representations disagree between endpoints;
* ordering changes between requests;
* malformed or impossible detection states silently reach the UI.

---

# 2. Scope

Implement a small deterministic **Detection Result Integrity** layer.

It must:

1. inspect the already-finalized detection;
2. validate structural invariants;
3. reuse existing domain facts;
4. produce deterministic structured information;
5. never modify detection/scoring behavior;
6. never become a second scoring system;
7. never perform network/DB/browser work;
8. never mutate the detection.

The integrity layer is a **validator / derived diagnostic**, not another detector.

---

# 3. Architecture

The intended architecture is:

```text
raw observations
      ↓
detectors
      ↓
deduplication
      ↓
scoring
      ↓
final Detection[]
      ↓
 ┌────┴───────────────┐
 ↓                    ↓
Quality           Provenance
 ↓                    ↓
 └──────────┬─────────┘
            ↓
      Result Integrity
            ↓
       API / diagnostics
```

Do not insert integrity checks inside detectors, deduplication, or scoring.

The finalized detection remains the single source of truth.

---

# 4. Domain model

Introduce a small domain model adapted to the existing architecture.

Suggested shape:

```ts
export type DetectionIntegrityIssue =
  | 'EMPTY_EVIDENCE'
  | 'PROVENANCE_MISMATCH'
  | 'INVALID_EVIDENCE_TYPE'
  | 'DUPLICATE_EVIDENCE'
  | 'INVALID_DETECTION_IDENTITY';

export interface DetectionIntegrity {
  readonly valid: boolean;
  readonly issues: readonly DetectionIntegrityIssue[];
}
```

Do **not** copy this blindly.

First inspect the existing domain types and naming conventions.

Reuse existing:

* `Detection`;
* `Evidence`;
* evidence identity;
* technology identity;
* provenance;
* quality models;
* existing validation utilities.

If the existing architecture already has an appropriate issue/error type, extend or reuse it rather than introducing a competing abstraction.

---

# 5. Integrity invariants

The following invariants must be checked.

## 5.1 Detection identity

A finalized detection must contain a valid technology identity according to the existing domain contract.

Do not invent a new identity format.

If the existing type guarantees this at compile time, avoid redundant runtime checks unless there is an actual serialization boundary that can violate it.

---

## 5.2 Evidence consistency

For a detection with evidence:

```text
detection.evidence.length > 0
```

must correspond to:

```text
provenance.evidenceCount === detection.evidence.length
```

when provenance is attached.

The integrity layer must derive from the same finalized evidence collection.

Never independently count raw detector output.

---

## 5.3 Evidence type consistency

Every value in:

```ts
provenance.evidenceTypes
```

must correspond to an actual evidence object's `type`.

No fabricated types.

No stale types.

No types originating from a detector that was subsequently deduplicated away.

---

## 5.4 Duplicate evidence

Use the project's existing canonical evidence identity.

Do **not** create another deduplication implementation.

The integrity validator may detect duplicates for diagnostic purposes, but must not remove them.

For example:

```text
validate(detection)
```

may report:

```text
DUPLICATE_EVIDENCE
```

but must return the original detection unchanged.

If the finalized pipeline guarantees that duplicates cannot exist, the test suite should explicitly lock that invariant down.

---

## 5.5 Provenance consistency

If provenance exists:

```text
evidenceCount
evidenceTypes
strongestEvidenceType
```

must all be derivable from the same `detection.evidence`.

Examples:

```text
evidence = [SCRIPT_URL, META_TAG]

evidenceCount = 2
evidenceTypes = [META_TAG, SCRIPT_URL]
```

The exact canonical order must continue to come from Step 80.

Do not duplicate the Step-80 ordering table.

Import and reuse the existing provenance computation.

---

# 6. Empty-evidence semantics

Do not automatically consider every zero-evidence detection invalid.

First inspect the existing domain.

If the domain legitimately permits detections without evidence, preserve that behavior.

In that case:

```text
evidenceCount = 0
provenance.evidenceTypes = []
```

is valid.

If the existing finalized detection contract explicitly requires evidence, then an empty collection is an integrity issue.

The implementation must follow the actual existing contract rather than inventing a stricter one.

---

# 7. Derived detections

Preserve the Step-80 rule.

Relationship-derived or otherwise derived detections must not accidentally acquire provenance merely because they are eventually serialized.

Likewise, integrity validation must distinguish:

```text
directly observed detection
```

from:

```text
derived relationship detection
```

using the existing domain distinction.

Do not introduce a second "derived detection" flag.

---

# 8. No mutation

This is critical.

The integrity layer must be pure:

```ts
computeDetectionIntegrity(detection): DetectionIntegrity
```

It must not:

* sort `detection.evidence`;
* remove duplicates;
* rewrite evidence;
* modify confidence;
* modify technology identity;
* attach provenance;
* mutate arrays;
* mutate objects.

It only observes and reports.

---

# 9. No new scoring system

Absolutely do not introduce:

```text
integrityScore
trustScore
reliabilityScore
qualityScore
```

or equivalent.

Step 79 already owns scan-result quality.

Step 80 already owns evidence provenance.

Step 81 owns **structural consistency only**.

A result is either structurally coherent or it has explicitly identified consistency issues.

---

# 10. API integration

Inspect all existing DetectionResponse-producing paths.

The objective is to ensure that integrity information is generated consistently.

If the existing API contract benefits from exposing it, add:

```ts
integrity?: DetectionIntegrity
```

to `DetectionResponse`.

However:

### Do not automatically expose internal diagnostics to the public API

First determine whether the existing API already exposes diagnostic/validation information.

If exposing it would unnecessarily expand the public contract, keep the integrity model domain/internal and use it for tests and development diagnostics.

Prefer the smallest public API change that provides real product value.

---

# 11. Endpoint consistency

Audit every existing path that serializes detections.

At minimum inspect:

* scan result endpoint;
* detection result mapping;
* GET-by-id;
* route-level response mapping;
* any history/comparison endpoint returning detections;
* relationship-derived detection paths.

There must be one canonical mapping path wherever the architecture permits it.

Do not create endpoint-specific provenance/integrity logic.

---

# 12. Determinism

For identical finalized input:

```text
computeDetectionIntegrity(detection)
```

must always return identical output.

No dependence on:

* object insertion order;
* Promise completion order;
* Map/Set iteration order where observable;
* timestamps;
* random IDs;
* database ordering;
* network state.

Issue ordering must be canonical.

For example:

```text
INVALID_DETECTION_IDENTITY
INVALID_EVIDENCE_TYPE
DUPLICATE_EVIDENCE
PROVENANCE_MISMATCH
EMPTY_EVIDENCE
```

Use an explicit canonical order rather than relying on incidental discovery order.

Adapt the actual order to existing project conventions.

---

# 13. Performance

Integrity checking must be cheap.

Target:

```text
O(number of evidence items)
```

per detection.

No:

* network;
* database;
* crawling;
* HTML parsing;
* filesystem;
* browser;
* detector execution;
* scorer execution.

Do not recalculate expensive detection logic.

---

# 14. Tests

Create focused pure-domain tests.

At minimum:

### Valid detection

```text
valid detection
→ valid = true
→ issues = []
```

### Empty evidence

Test according to the existing domain contract.

### Duplicate evidence

```text
duplicate canonical evidence
→ DUPLICATE_EVIDENCE
```

if duplicates are structurally invalid.

### Provenance mismatch

Construct an intentionally inconsistent provenance representation and verify it is detected.

### Evidence type mismatch

Ensure provenance cannot claim a type absent from the actual evidence.

### Multiple issues

Verify canonical issue ordering.

### Determinism

Same detection repeatedly produces identical integrity output.

### Mutation safety

Freeze the input object/arrays where practical and verify validation does not mutate them.

### Permutation

If evidence ordering is irrelevant semantically, verify that permutation does not change the resulting integrity state.

---

# 15. Pipeline integration tests

Add at least one real pipeline-level regression test:

```text
fixture
  ↓
observations
  ↓
CompositeDetector
  ↓
DeduplicatingDetector
  ↓
ConfidenceScorer
  ↓
final Detection
  ↓
Provenance
  ↓
Integrity
```

Verify that a normal production detection is valid.

Also verify that Step 81 does not alter:

* detection identity;
* evidence;
* confidence;
* ordering;
* scan quality;
* provenance.

---

# 16. Regression protection

The existing test suite currently has a large green baseline.

Do not rewrite existing expectations merely to accommodate Step 81.

Any changed snapshot/assertion must correspond to a real intentional API contract change.

Explicitly protect:

```text
Detection identity
Evidence
Confidence
Technology identity
Detection ordering
Scan quality
Provenance
Derived-detection behavior
```

---

# 17. UI

Only make a UI change if the integrity information has a genuine user-facing meaning.

Do **not** add a permanent:

```text
Integrity: OK
```

badge to every detection.

That would expose an implementation diagnostic as product noise.

If the existing UI has a developer/debug/diagnostic surface, integrity issues may be surfaced there.

For normal production results:

```text
no issue = no additional UI
```

If a real integrity issue can reach production, prefer an existing error/diagnostic presentation rather than inventing a new visual system.

---

# 18. Browser validation

If the implementation changes UI/API-visible behavior:

Run the existing browser/E2E validation.

Verify:

* normal detection cards remain unchanged when valid;
* provenance remains readable;
* no duplicated signal information;
* no layout regression;
* no console errors;
* derived detections remain correctly represented.

If there is no meaningful UI change, browser validation is not required merely for ceremony.

---

# 19. Architecture audit

Before implementation, inspect the repository for existing concepts that may overlap:

```text
validation
integrity
diagnostics
assertions
evidence identity
evidence deduplication
detection validation
response validation
```

Do not create a duplicate abstraction.

If an existing utility already expresses part of the invariant, consolidate around it.

---

# 20. Forbidden implementations

Do NOT:

* add a new detector;
* add a new crawler;
* add a new resource fetch;
* modify the scoring algorithm;
* modify confidence semantics;
* create another evidence deduplication implementation;
* create another evidence identity implementation;
* create a second provenance model;
* introduce an integrity score;
* introduce an AI/LLM;
* add ML/Bayesian inference;
* add a new database column;
* add a new persistence layer;
* add network calls;
* make validation asynchronous without a real need;
* mutate finalized detections;
* duplicate response mapping logic;
* redesign the Scan Detail UI;
* redesign the dashboard;
* create a generic validation framework "for future use".

Keep Step 81 narrowly focused.

---

# 21. Documentation

Update the relevant architecture documentation only where necessary.

Document the final semantic pipeline:

```text
Observation
→ Detection
→ Deduplication
→ Scoring
→ Scan Quality
→ Provenance
→ Integrity
→ API/UI
```

Clarify ownership:

* **Detection** = what was detected.
* **Evidence** = why it was detected.
* **Quality** = contextual quality of the scan/result.
* **Provenance** = which evidence types support the detection.
* **Integrity** = whether these representations remain structurally coherent.

Do not duplicate detailed implementation documentation if the repository already has an appropriate architecture document.

---

# 22. Implementation workflow

Work in this order.

## Phase A — Repository inspection

Before editing:

1. inspect current `Detection`;
2. inspect `Evidence`;
3. inspect canonical evidence identity;
4. inspect Step-80 provenance;
5. inspect Step-79 quality;
6. inspect detection response mapping;
7. inspect all detection API paths;
8. search for existing validation/integrity utilities.

Do not assume the proposed type names are exact.

Adapt to the real repository.

## Phase B — Domain implementation

Implement the smallest pure integrity projection.

Keep it browser-free and IO-free.

## Phase C — Integration

Integrate only where the existing architecture genuinely benefits.

Avoid unnecessary public API expansion.

## Phase D — Tests

Add:

* domain tests;
* mapping/API regression tests where applicable;
* pipeline integration tests.

## Phase E — Browser

Only if UI/API-visible behavior changed.

Use the existing browser tooling.

## Phase F — Final audit

Inspect:

```bash
git status
git diff --stat
git diff
```

Confirm only intended Step-81 files changed.

---

# 23. Validation

Run the repository's actual validation suite.

At minimum:

```bash
pnpm typecheck
pnpm exec eslint .
pnpm exec prettier --check <touched-files>
pnpm exec vitest run
pnpm -r build
npx madge --circular
```

If the repository has a dedicated E2E command and UI/API behavior changed:

```bash
pnpm test:e2e
```

Do not claim PASS if any required check fails.

---

# 24. Final QA report

At completion, report:

### Implementation

* files added;
* files modified;
* exact architecture change;
* whether the public API changed;
* whether persistence changed.

### Integrity invariants

List every invariant actually implemented.

### Tests

Report exact counts.

### Validation

Report:

```text
typecheck
eslint
prettier
vitest
build
circular dependency check
E2E/browser
```

with exact results.

### Browser

If applicable:

* pages/routes checked;
* detection examples checked;
* console status;
* visual status.

### Architecture

Explicitly confirm:

```text
No new detector
No new crawler
No scorer modification
No third deduplication
No new DB column
No new network dependency
No mutation
No integrity score
```

### Commit

Create one clean commit dedicated to Step 81.

Do not include:

* docs unrelated to Step 81;
* build artifacts;
* generated files;
* settings;
* temporary debugging files;
* unrelated formatting changes.

Report the commit hash.

---

# 25. Definition of Done

Step 81 is PASS only when:

* [ ] existing domain contracts have been inspected;
* [ ] existing validation/identity utilities have been reused where appropriate;
* [ ] integrity is a pure derived diagnostic;
* [ ] finalized detection remains the source of truth;
* [ ] evidence is never mutated;
* [ ] no third deduplication implementation exists;
* [ ] provenance consistency is verified;
* [ ] evidence identity consistency is verified;
* [ ] issue ordering is deterministic;
* [ ] no integrity score exists;
* [ ] scoring behavior is unchanged;
* [ ] detection identity is unchanged;
* [ ] scan quality is unchanged;
* [ ] derived detection behavior is unchanged;
* [ ] API changes, if any, are minimal and intentional;
* [ ] unit tests pass;
* [ ] integration/regression tests pass;
* [ ] typecheck passes;
* [ ] lint passes;
* [ ] formatting passes;
* [ ] build passes;
* [ ] circular dependency check passes;
* [ ] browser/E2E validation passes when applicable;
* [ ] final diff contains only intended changes;
* [ ] clean dedicated commit is created;
* [ ] final QA report is produced.

---

# 26. Guiding principle

```text
Step 79 — Make the result better.
Step 80 — Make the result explainable.
Step 81 — Make the result internally consistent.
```

Do not make DevLens more complex merely because the architecture now has more concepts.

The goal is the opposite:

> More information, fewer contradictions, zero duplicated sources of truth.
