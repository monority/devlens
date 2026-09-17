# DevLens — Step 43 : Product Capability Audit & Next Product Slice

## Objective

Step 42 centralized the evidence identity and deduplication logic into one canonical module.

The detection/explainability architecture is now sufficiently consolidated.

**Do NOT add another presentation metric.**

The purpose of Step 43 is to inspect the current product end-to-end and identify the next **meaningful user-facing product capability**.

This step is primarily an **audit and planning step**.

Do not implement a speculative feature simply to produce code.

---

# 1. First: inspect the real repository

Before changing anything, inspect the current repository.

Do not rely on this prompt alone for the current architecture.

Inspect at minimum:

* `apps/*`
* `packages/*`
* scan-related routes
* scan execution flow
* scan persistence
* Scan Detail pages/components
* detection/explainability modules
* comparison functionality
* existing navigation
* existing scan history/listing
* existing API endpoints
* existing tests
* existing documentation/specifications

Also inspect the recent Step 37–42 changes and their actual integration points.

Determine what is genuinely implemented versus what is only partially implemented.

---

# 2. Establish the current end-to-end user journey

Document the actual current workflow.

At minimum answer:

```text
How does a user:

1. arrive at DevLens?
2. submit a URL?
3. start a scan?
4. know that the scan is running?
5. know that it completed?
6. access the result?
7. understand detected technologies?
8. inspect evidence?
9. understand confidence/explanation?
10. return to previous scans?
11. compare scans, if supported?
12. start another scan?
```

Do not assume a capability exists merely because a corresponding backend module exists.

Trace the actual UI → API → domain → persistence → UI flow.

---

# 3. Build a capability matrix

Create a concise matrix of the current product.

Use categories such as:

| Capability             | Status                          |
| ---------------------- | ------------------------------- |
| Start scan             | implemented / partial / missing |
| Scan lifecycle         | implemented / partial / missing |
| Scan persistence       | implemented / partial / missing |
| Scan history           | implemented / partial / missing |
| Scan detail            | implemented / partial / missing |
| Technology exploration | implemented / partial / missing |
| Evidence exploration   | implemented / partial / missing |
| Explainability         | implemented / partial / missing |
| Comparison             | implemented / partial / missing |
| Rescan                 | implemented / partial / missing |
| Error handling         | implemented / partial / missing |
| Empty states           | implemented / partial / missing |
| Navigation             | implemented / partial / missing |
| API usability          | implemented / partial / missing |
| Export                 | implemented / partial / missing |

Only include capabilities that are relevant to the actual repository.

Do not invent missing requirements.

---

# 4. Identify the largest product gap

After the audit, identify the most important missing capability in terms of the actual product workflow.

The capability must satisfy these criteria:

### A. User-facing

It must allow the user to accomplish something meaningful.

### B. Coherent with the existing architecture

It must reuse existing:

* domain models
* scan lifecycle
* persistence
* detection pipeline
* evidence model
* existing UI patterns

### C. Incremental

It should be implementable as a well-defined next slice.

### D. Not another metric

Do not recommend:

* another count
* another badge
* another coverage number
* another small summary card
* another cosmetic Scan Detail section

### E. Product value

Prefer capabilities that move DevLens toward a complete usable workflow.

Examples of potentially relevant directions:

```text
scan history
technology exploration
scan comparison
rescan workflow
scan filtering/search
technology detail
historical evolution
export
API consumption
```

These are examples only.

**Do not choose one unless the repository audit demonstrates that it is the appropriate next slice.**

---

# 5. Inspect `comparison.ts` carefully

Step 42 revealed that `comparison.ts` already exists.

Do not assume comparison is complete.

Determine:

* what `comparison.ts` actually compares
* who consumes it
* whether comparison has a UI
* whether comparison is exposed to users
* whether it is merely an internal utility
* what domain semantics already exist
* whether its existing functionality could support a meaningful next product capability

This is important.

Do not duplicate comparison logic if it already exists.

---

# 6. Inspect Scan Detail architecture

Specifically map:

```text
ScanDetailView
├── data acquisition
├── loading
├── error
├── completed state
├── failed state
├── overview
├── insights
├── coverage
├── detections
├── filters
├── explainability
└── evidence
```

Identify whether responsibilities are currently:

* correctly separated
* duplicated
* unnecessarily coupled
* missing entirely

Do not refactor everything.

Only report architectural issues that materially affect the next product capability.

---

# 7. Inspect the persistence/API boundary

Determine what the current backend already makes possible.

Answer:

* Can scans be retrieved individually?
* Can multiple scans be retrieved?
* Can scans be listed?
* Are scans ordered deterministically?
* Is there enough persisted information to build history/comparison?
* Are scan results immutable after completion?
* Can a scan be rerun?
* Are failed scans retained?
* What information is available without rerunning the crawler?

Again:

**Do not modify persistence merely because a capability might eventually need it.**

First determine what is already available.

---

# 8. Determine the next vertical slice

Based on the audit, propose exactly **one** next product capability.

Define it as a vertical slice:

```text
User action
    ↓
UI
    ↓
API / application layer
    ↓
Domain
    ↓
Persistence
    ↓
Result
    ↓
UI feedback
```

The slice must have:

* clear user action
* clear system behavior
* clear success state
* clear failure state
* deterministic behavior
* tests
* minimal architectural changes

---

# 9. Do NOT implement the next capability yet

This is critical.

Step 43 is an architecture/product decision step.

Do not implement the proposed feature unless the repository contains an obvious incomplete implementation that must be repaired to correctly understand the product capability.

Normally:

```text
AUDIT
→ FINDINGS
→ CAPABILITY MATRIX
→ IDENTIFY GAP
→ PROPOSE ONE NEXT SLICE
→ STOP
```

Do not start Step 44 implementation inside Step 43.

---

# 10. Documentation

Create:

```text
docs/Step43-product-capability-audit.md
```

The document must contain:

## 1. Current product state

Short factual description.

## 2. End-to-end user flow

Actual current flow.

## 3. Capability matrix

Implemented / partial / missing.

## 4. Scan Detail architecture

Current structure and relevant observations.

## 5. Backend/API/persistence capabilities

What already exists and what does not.

## 6. Existing comparison capability

Explicitly document what `comparison.ts` does today.

## 7. Main product gap

Identify the most meaningful missing capability.

## 8. Proposed Step 44

Define exactly one vertical slice.

Include:

```text
Goal
User story
Current reusable infrastructure
Required changes
Domain impact
API impact
UI impact
Persistence impact
Tests
Acceptance criteria
Non-goals
```

---

# 11. Scope protection

Do NOT:

* add another metric
* redesign Scan Detail
* rewrite the detection architecture
* rewrite the crawler
* modify confidence scoring
* modify evidence identity
* add a new database technology
* add dependencies without necessity
* redesign the entire UI
* implement speculative future features
* add dashboards just for visual completeness
* create abstractions without an immediate consumer
* change existing public behavior unnecessarily

The purpose of this step is **decision quality**, not code volume.

---

# 12. Validation

Because this step should normally only add documentation, run the repository validation suite to ensure the audit itself did not introduce regressions.

At minimum:

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

If no source code is changed, explicitly state that validation confirms the repository remains green.

---

# 13. Final report

Return:

```text
Step 43 — COMPLETE

1. Current product state
2. End-to-end user journey
3. Capability matrix
4. Scan Detail architecture findings
5. Persistence/API findings
6. Existing comparison findings
7. Main product gap
8. Proposed Step 44
9. Exact Step 44 vertical slice
10. Files changed
11. Validation
12. Risks / unknowns
13. Why this is the next logical product capability
```

Do not claim a feature is implemented if it is only proposed.

The final recommendation must be based on the actual repository.

---

# Definition of Done

Step 43 is complete when:

* the real current product has been audited
* the end-to-end user workflow is documented
* implemented/partial/missing capabilities are distinguished
* Scan Detail architecture has been inspected
* persistence/API capabilities have been inspected
* `comparison.ts` has been understood in context
* one meaningful product gap has been identified
* exactly one next vertical slice has been specified
* no unnecessary implementation has been performed
* `docs/Step43-product-capability-audit.md` exists
* repository validation remains green
* Step 44 can be implemented directly from the resulting specification

**Golden rule:**

> Step 42 consolidated the architecture. Step 43 must decide what the user should actually be able to do next.
