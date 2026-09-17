# DevLens — Step 42 : Canonical Evidence Identity

## Context

Step 41 is complete.

Current state:

* `ScanDetectionResults` uses canonical evidence identity.
* `DetectionCoverage` deduplicates evidence.
* `DetectionExplainability` now deduplicates and deterministically sorts evidence.
* `DetectionItem` consumes the explainability model and its deduplicated evidence.
* No detection algorithm or confidence calculation was modified.
* Current validation is green:

  * 1501 tests passed
  * 18 skipped
  * typecheck PASS
  * ESLint PASS
  * Prettier PASS
  * build PASS
  * circular dependencies PASS
  * `jsx: "preserve"` intact.
* Step 41 commit: `b756550`.

## Important finding

There are currently multiple implementations/usages of the canonical evidence identity logic.

The Step 41 implementation reports that `evidenceIdentity()` was replicated from:

* `scan-insights.ts`
* `scan-detection-results.ts`

and is now also used by:

* `detection-explainability.ts`

This is precisely the kind of semantic duplication we should eliminate before continuing.

---

# Objective

Create **one canonical implementation** of evidence identity and make all consumers use it.

The objective is purely architectural:

```text
Evidence
   ↓
getEvidenceIdentity()
   ↓
canonical identity
```

Every feature that needs evidence equality/deduplication must use the same function.

---

# Step 1 — Audit current implementations

Before modifying anything, inspect all occurrences of:

```text
evidenceIdentity
```

and related logic.

Search for:

* `evidenceIdentity`
* `getEvidenceIdentity`
* evidence deduplication
* `Set` usage involving evidence
* string keys constructed from evidence fields
* evidence sorting based on identity
* equivalent local helper functions.

Identify every implementation and consumer.

Do not assume the report is complete.

---

# Step 2 — Determine the canonical semantics

There must be exactly one canonical definition of evidence identity.

The canonical implementation must preserve the behavior already established by Steps 38–41.

Do NOT change the identity algorithm merely for aesthetic reasons.

First determine:

* which fields participate in identity;
* normalization rules;
* handling of missing/null fields;
* treatment of URLs;
* treatment of headers;
* treatment of evidence type;
* treatment of evidence values;
* deterministic serialization.

The refactor must preserve existing semantics.

---

# Step 3 — Extract one pure utility

Create an appropriately located pure utility, following the repository's existing architecture.

Possible conceptual API:

```ts
getEvidenceIdentity(evidence)
```

Do not blindly use this exact name if the project already has a naming convention.

Requirements:

* pure;
* deterministic;
* no React dependency;
* no database;
* no network;
* no mutation;
* no global state.

The function must return the canonical identity already expected by existing behavior.

---

# Step 4 — Replace duplicated implementations

Update all consumers to import the canonical implementation.

At minimum inspect:

```text
scan-insights.ts
scan-detection-results.ts
detection-explainability.ts
```

Also inspect any other modules found during the audit.

After the refactor there must be:

```text
ONE IMPLEMENTATION
MANY CONSUMERS
```

not:

```text
ONE ALGORITHM
COPIED THREE TIMES
```

---

# Step 5 — Preserve public behavior

This is a refactor, not a behavior change.

The following must remain identical:

* evidence deduplication;
* evidence ordering;
* evidence counts;
* explainability output;
* detection results;
* coverage metrics;
* Scan Detail rendering.

Do not modify:

* detector logic;
* confidence scoring;
* detection ranking;
* crawler behavior;
* database behavior;
* API contracts.

---

# Step 6 — Tests

Move or create focused tests around the canonical utility.

At minimum test:

1. identical evidence → identical identity;
2. different evidence → different identity when semantically required;
3. normalization behavior;
4. null/missing fields;
5. URL behavior;
6. header behavior;
7. different evidence types;
8. deterministic output;
9. deduplication through the canonical identity;
10. regression against existing consumers.

Prefer one authoritative test suite for the identity algorithm.

Consumer tests should verify that the consumers use its semantics, without duplicating every implementation detail.

---

# Step 7 — Avoid abstraction overreach

Do NOT create:

* a generic "EvidenceService";
* an evidence repository;
* an evidence manager;
* dependency injection;
* a class;
* a new framework;
* a state store;
* a generic canonicalization framework.

A small pure function is sufficient.

---

# Step 8 — Validate architecture

After implementation, search the repository again.

The goal is to verify that there is only one implementation of the identity algorithm.

It is acceptable to have many calls to the canonical function.

It is NOT acceptable to have several equivalent local implementations.

---

# Step 9 — Validation

Run the full existing validation suite:

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

remains unchanged.

All pre-existing tests must remain green.

---

# Scope restrictions

Do NOT:

* redesign Scan Detail;
* add another metrics component;
* modify detection algorithms;
* modify confidence scoring;
* modify evidence schemas unless absolutely required;
* change evidence semantics;
* add new evidence types;
* change API contracts;
* change persistence;
* add dependencies.

This step exists only to establish a canonical shared primitive.

---

# Completion report

Report:

## Status

`COMPLETE` / `PARTIAL` / `BLOCKED`

## Audit

List every previous evidence identity implementation found.

## Canonical implementation

Report:

* file;
* exported function;
* exact consumers.

## Refactored consumers

List all changed modules.

## Behavioral preservation

Confirm that:

* deduplication is unchanged;
* ordering is unchanged;
* counts are unchanged;
* rendered output is unchanged.

## Tests

Report new/updated tests and final totals.

## Validation

Report:

* typecheck;
* tests;
* lint;
* formatting;
* build;
* circular dependencies.

## Git

Report commit hash if committed.

Do not push if credentials are unavailable.

---

# Definition of Done

Step 42 is complete only if:

* exactly one canonical evidence identity implementation exists;
* all consumers use it;
* existing behavior is preserved;
* tests explicitly protect its semantics;
* no unnecessary abstraction was introduced;
* all validation passes.

# Next-step rule

Do not automatically create another presentation metric after this step.

Once Step 42 is complete, inspect the overall Scan Detail architecture and identify the next **meaningful product capability**, rather than continuing to add small reporting widgets.
