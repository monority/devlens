# EXECUTE STEP 63 NOW — DO NOT JUST INSPECT IT

You have just verified that Step 63 has NOT been implemented yet.

That is correct.

`docs/Step63.md` is the specification for the work that must now be performed.

The previous response only checked repository state. That was not the requested task.

## YOUR TASK NOW

EXECUTE THE FULL CONTENT OF `docs/Step63.md`.

Do not merely summarize it.
Do not report that it is untracked.
Do not perform another "is Step 63 done?" investigation.

The specification is the work order.

---

# BIG STEP 63 — EXECUTION

Perform the complete:

**Scan Data Integrity & Detection Reliability**

investigation described in `docs/Step63.md`.

Follow all phases in the specification:

- Phase 0 — Quick reconnaissance
- Phase 1 — Data integrity invariants
- Phase 2 — Deduplication attack
- Phase 3 — Scoring attack
- Phase 4 — Persistence round-trip
- Phase 5 — API serialization
- Phase 6 — Target normalization
- Phase 7 — Failure semantics
- Phase 8 — Determinism
- Phase 9 — Invariant testing
- Phase 10 — Fix confirmed issues
- Phase 11 — Independent self-audit
- Phase 12 — Validation

---

# IMPORTANT EXECUTION RULE

Do not stop because the architecture already appears correct.

Actually investigate the implementation.

The goal is to discover whether the data pipeline can produce incorrect,
unstable, contradictory, duplicated, or lossy results.

Use the existing code and tests.

Where possible, construct concrete inputs and compare outputs.

Do not manufacture bugs.

If everything is genuinely correct, that is a valid result.

But you must reach that conclusion through meaningful investigation, not by
simply reading filenames or checking whether tests are green.

---

# PRIORITY

Focus especially on:

1. Detection deduplication
2. Evidence identity
3. Confidence scoring
4. Deterministic ordering
5. Persistence round-trip
6. API serialization
7. Scan target consistency
8. Failed-scan semantics
9. Domain → persistence → API → UI data preservation

Look for subtle bugs, not just obvious crashes.

---

# IF YOU FIND A BUG

For every real bug:

1. Reproduce it.
2. Identify the root cause.
3. Fix it at the correct architectural layer.
4. Add a regression test.
5. Re-run the affected tests.
6. Verify that the fix did not introduce a regression.

Do not merely document the bug.

---

# SELF-AUDIT IS MANDATORY

After the implementation and tests are green:

Review the final diff as if another developer submitted it.

Check:

- correctness
- determinism
- persistence
- API serialization
- detection/evidence integrity
- scoring
- lifecycle semantics
- regressions
- test quality
- architecture
- code quality

If you discover a real issue during this second review, fix it before
finishing.

Do not manufacture issues.

---

# VALIDATION

Run the complete validation requested by Step 63:

- focused tests
- full Vitest
- TypeScript
- ESLint
- Prettier
- Next.js production build
- madge circular dependency check

Use existing integration/render/domain/repository/API tests where appropriate.

There is no need to create a Playwright infrastructure just for this step.

---

# DOCUMENTATION

When the work is actually complete:

1. Update/write `docs/Step63-report.md`.
2. The report must describe:
   - what was investigated
   - concrete problems discovered
   - root causes
   - fixes
   - regression tests
   - determinism results
   - persistence results
   - API serialization results
   - failure semantics
   - validation results
   - self-audit results
   - remaining concerns
3. Do not create a report claiming completion before the work is actually
   finished.

---

# GIT

When everything is complete and validated:

Create the appropriate commit:

`Step 63: Scan Data Integrity & Detection Reliability`

The commit should contain the actual Step 63 implementation, tests, and
report.

Do not create a fake/empty commit merely to mark the step complete.

---

# FINAL RESPONSE

Only after the work is genuinely complete, return a concise final report:

## Step 63 Complete

### Problems discovered
...

### Fixes
...

### Tests
...

### Data integrity
...

### Determinism
...

### Persistence
...

### API
...

### Failure semantics
...

### SELF-AUDIT
...

### Validation
...

### Commit
...

### Remaining concerns
...

If no real defects are found, explicitly say:

`DATA INTEGRITY AUDIT: CLEAN`

and explain what was actually tested to reach that conclusion.

STOP AFTER THE REPORT.

Do not automatically begin Step 64.