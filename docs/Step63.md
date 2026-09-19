# DevLens — Big Step 63: Scan Data Integrity & Detection Reliability

## OBJECTIVE

We now have evidence that the Product Reality Audit strategy works:

Step 62 found and fixed a real P1 product bug where failed scans displayed
"the scan completed successfully".

Do NOT revert to micro-steps.

This is another BIG STEP.

The objective is to validate and harden the most important part of DevLens:

> Is the scan result data itself internally consistent, deterministic, correctly
> persisted, correctly serialized, and correctly presented?

DevLens is fundamentally a website technology detection engine.

A beautiful UI is not useful if:

- detections are duplicated,
- evidence is lost,
- scores are inconsistent,
- technologies are incorrectly identified,
- scan targets change during the pipeline,
- persistence changes the result,
- ordering is unstable,
- failed/partial states leak incorrect data,
- API serialization differs from domain data.

Use the existing architecture.

Do NOT redesign the detector system.

Do NOT introduce a new detection architecture.

Do NOT add unrelated UI features.

---

# PHASE 0 — QUICK RECONNAISSANCE

Briefly trace the actual data path:

HTTP crawler
→ observations
→ detectors
→ composite detector
→ deduplication
→ scoring
→ runScan
→ persistence
→ repository
→ API
→ ScanDetailResponse
→ UI

Identify the existing implementations and tests for:

- Detection
- Evidence
- Technology
- Confidence
- deduplication
- scoring
- evidence identity
- scan persistence
- scan serialization
- scan detail API

Do not perform a large theoretical audit.

---

# PHASE 1 — CREATE A DATA INTEGRITY MODEL

Without introducing unnecessary abstractions, explicitly determine the invariants that should always hold.

Examples:

### Scan

A scan should have:

- one stable scanId
- one stable target
- one valid lifecycle status
- coherent timestamps
- deterministic persisted state

### Detection

A detection should have:

- one valid technology
- one finite confidence value
- deterministic ordering
- evidence belonging to that technology

### Evidence

Evidence should:

- have a valid discriminated type
- contain valid data for its type
- be deduplicated according to the existing canonical identity rules
- survive persistence and serialization

### Ranking

For identical input:

> identical detectors + identical observations
> must produce identical detection ordering and confidence.

Do not merely document these invariants.

Use them to attack the implementation.

---

# PHASE 2 — ATTACK DEDUPLICATION

Inspect the complete evidence/detection deduplication path.

Test cases should include:

- exact duplicate evidence
- same URL with different casing
- same header with different casing where appropriate
- same evidence emitted by multiple detectors
- duplicate technology detections
- same technology with multiple evidence types
- identical evidence arriving in different orders

Important question:

> Does reordering detector output change the final result?

If yes, determine whether that is intentional.

If not intentional:

- fix it
- add a regression test

Do not change canonical identity rules unless the existing rules are demonstrably wrong.

---

# PHASE 3 — ATTACK SCORING

Inspect the complete scoring path.

Verify:

- base score
- extra evidence contribution
- cap
- NaN handling
- Infinity handling
- negative values
- duplicate evidence
- deterministic ties
- technology ordering

Test:

### Case A
Same input twice → same scores.

### Case B
Same evidence in different order → same scores.

### Case C
Duplicate evidence → does not artificially inflate confidence.

### Case D
Very large evidence set → remains bounded.

### Case E
Invalid numeric values → never leak NaN/Infinity.

### Case F
Equal confidence → deterministic ordering.

If a real issue exists, fix it at the scoring layer.

---

# PHASE 4 — ATTACK PERSISTENCE

Trace:

domain result
→ database representation
→ repository
→ API response.

Verify that persistence does not change semantics.

For representative scans, compare:

BEFORE PERSISTENCE
vs
AFTER READ-BACK

for:

- scanId
- target
- status
- timestamps
- technologies
- confidence
- evidence
- evidence ordering

The result should be semantically equivalent.

Pay particular attention to JSON/JSONB boundaries.

Potential problems to investigate:

- undefined values disappearing
- dates becoming inconsistent
- evidence discriminators being lost
- array ordering changing
- nullable fields becoming inconsistent
- numeric values changing
- empty arrays vs missing fields

Do not change the database schema unless a real defect requires it.

---

# PHASE 5 — ATTACK API SERIALIZATION

Inspect the API boundary.

Verify that:

domain/persistence data
→ API response
→ frontend model

does not silently change meaning.

Test:

- completed scan with detections
- completed scan with zero detections
- failed scan
- missing scan
- multiple detections
- multiple evidence types

Pay particular attention to:

- status
- target
- confidence
- evidence
- technology identity
- timestamps

If the API already has a response adapter/mapper, reuse it.

Do not duplicate serialization logic.

---

# PHASE 6 — ATTACK TARGET NORMALIZATION

Inspect how scan targets are represented throughout the system.

Test representative targets:

- `https://example.com`
- `https://example.com/`
- uppercase hostname
- query string
- fragment
- long path
- encoded characters

Determine exactly what DevLens currently considers:

- the same target
- a different target

This is important because Step 57 intentionally uses exact
`scan.target` string identity for same-target history.

DO NOT silently change that behavior.

Instead:

1. determine whether the current semantics are intentional;
2. identify inconsistencies where different layers normalize the target differently;
3. fix only genuine inconsistencies.

A target must not be normalized differently between:

- scan creation
- crawler
- persistence
- history
- re-scan
- comparison

unless that difference is explicitly intentional.

---

# PHASE 7 — ATTACK FAILURE SEMANTICS

Inspect failure handling end-to-end.

Test or reason through:

- invalid URL
- crawler failure
- HTTP failure
- timeout
- detector failure
- persistence failure
- unexpected exception

For each case determine:

1. What status is produced?
2. What data remains available?
3. What detections/evidence are persisted?
4. What does the API return?
5. What does the UI display?

Look specifically for contradictions like the Step 62 bug:

> status says FAILED
> while another layer presents successful/completed semantics.

Find and fix any similar inconsistencies.

Do not invent a new error model.

Use the existing lifecycle semantics.

---

# PHASE 8 — DETERMINISM TEST

This is important.

Construct at least one representative scan input and execute the detection/scoring pipeline multiple times.

Compare:

- technology IDs
- confidence
- evidence identity
- evidence ordering
- detection ordering

The same logical input should produce the same output.

If it does not:

1. identify the nondeterministic source;
2. determine whether it is intentional;
3. fix accidental nondeterminism;
4. add a regression test.

Potential sources include:

- object iteration
- Map/Set ordering assumptions
- detector registration order
- unstable sorting
- database result ordering
- timestamps leaking into ranking
- asynchronous collection order

---

# PHASE 9 — PROPERTY / INVARIANT TESTING

Where practical, add lightweight invariant tests rather than hundreds of
individual examples.

Useful invariants:

- confidence is always finite
- confidence stays within expected bounds
- duplicate evidence cannot increase confidence
- detection ordering is deterministic
- evidence identity is stable
- persisted results round-trip correctly
- failed scans cannot expose successful-result semantics

Use the existing test style.

Do not introduce a property-testing framework unless the repository already
uses one and it materially helps.

---

# PHASE 10 — FIX REAL ISSUES

For every confirmed defect:

1. Identify root cause.
2. Fix at the correct architectural layer.
3. Add a regression test.
4. Run the affected tests.
5. Check that the fix does not break existing behavior.

Do not manufacture issues.

Do not refactor unrelated code.

Do not rewrite working systems simply because you would architect them
differently.

---

# PHASE 11 — SELF-AUDIT

After implementation, perform a second independent review.

Review the final diff as if another developer submitted it.

Check:

### Correctness
- Any remaining data integrity problems?
- Any hidden null/undefined paths?
- Any incorrect lifecycle semantics?

### Determinism
- Any unstable ordering left?
- Any dependence on iteration order?

### Persistence
- Any domain → DB → API information loss?

### API
- Any serialization inconsistency?

### Detection
- Any duplicate technology/evidence problems?

### Scoring
- Any NaN/Infinity/overflow/tie issues?

### Regression
Verify that these still work:

- new scan
- completed scan
- zero-detection scan
- failed scan
- re-scan
- scan history
- comparison
- technology navigation
- evidence display

If the self-audit discovers a real issue, FIX IT before reporting completion.

Do not manufacture issues.

---

# PHASE 12 — VALIDATION

Run:

- focused tests
- full Vitest
- TypeScript
- ESLint
- Prettier
- Next production build
- madge circular dependency check

If practical, execute existing runtime/browser tests.

Important:

There is currently no Playwright E2E infrastructure according to Step 62.

Do not waste time trying to invent an E2E framework for this step.

Instead, use:

- integration tests
- render tests
- domain tests
- repository tests
- API tests

where they provide equivalent coverage.

---

# SUCCESS CRITERIA

This is NOT measured by number of files changed.

Success means one of:

### A — Real defects found

Real data-integrity/determinism/persistence/API bugs were found,
fixed, and protected with regression tests.

### B — No defects found

The investigation genuinely confirms the invariants.

If so:

> DATA INTEGRITY AUDIT: CLEAN

Do not create fake changes.

---

# FINAL REPORT

Return:

## BIG STEP 63 — DATA INTEGRITY & DETECTION RELIABILITY

### Data path inspected

- ...

### Invariants checked

- ...

### Problems discovered

- P0:
- P1:
- P2:

### Fixes

- ...

### Regression tests

- ...

### Determinism

- ...

### Persistence round-trip

- ...

### API serialization

- ...

### Failure semantics

- ...

### Validation

- Vitest:
- TypeScript:
- ESLint:
- Prettier:
- Build:
- Madge:
- Runtime:

### SELF-AUDIT

- Issues found:
- Issues fixed:
- Additional tests:
- Remaining concerns:
- Technical debt:

### Commit

- hash:
- message:

### Final status

One of:

DATA INTEGRITY AUDIT: BUGS FOUND AND FIXED

or

DATA INTEGRITY AUDIT: CLEAN

or

DATA INTEGRITY AUDIT: PARTIALLY VALIDATED

STOP HERE.

Do not automatically implement another step.