# DevLens — STEP 69: Technology Relationship Semantics

## OBJECTIVE

Step 68 established a scalable declarative technology catalog:

* 54 technologies
* one declarative definition per technology
* reusable signatures
* six observable signal types
* optional deterministic version extraction
* catalog validation
* deterministic scoring
* collision testing
* no technology-specific detector branches

Step 66 identified another major difference between DevLens and mature
technology-detection systems:

* `implies`
* `requires`
* `excludes`

Step 69 introduces these relationship semantics.

The objective is:

> Allow DevLens to represent deterministic relationships between technologies
> without fabricating observable evidence, without changing the meaning of
> confidence, and without turning relationships into an uncontrolled inference
> engine.

This is a REAL IMPLEMENTATION step.

---

# CRITICAL PRINCIPLES

## 1. Observed and inferred are different

This is the most important requirement.

A technology can be:

### Directly detected

An observable signature matched.

Example:

```text
WordPress
  evidence:
    meta generator = WordPress 6.4.2
```

or:

### Relationship-derived

A declared relationship follows from another detection.

Example:

```text
WooCommerce
  requires → WordPress
```

If WooCommerce is directly detected, WordPress may be represented as
relationship-derived if the semantics explicitly permit it.

But DevLens MUST NOT pretend that an observable WordPress signature was found.

Never fabricate:

```text
Evidence {
  type: meta_tag
  ...
}
```

when no meta tag matched.

---

# 2. Do not copy Wappalyzer semantics blindly

Use the benchmark as architectural inspiration.

Define semantics that fit DevLens.

Document every semantic choice.

If the existing domain model makes one interpretation safer, prefer the
explicit deterministic model over compatibility with another product.

---

# 3. Do not change crawler capabilities

No:

* browser
* DOM
* CSS
* cookies
* DNS
* TLS
* favicon
* XHR
* JavaScript execution

This step operates entirely on the existing snapshot.

---

# 4. Do not redesign scoring

The existing confidence score remains:

* deterministic
* 0–100
* a ranking score, NOT probability

Relationship propagation must not silently inflate confidence.

Do not add relationship bonuses to the existing scorer in this step.

---

# PHASE 0 — INSPECT CURRENT IMPLEMENTATION

Inspect the actual Step 68 architecture.

Confirm:

* `TechnologyDefinition`
* catalog composition
* signatures
* `Detection`
* `Evidence`
* detector pipeline
* deduplication
* scoring
* API response
* UI rendering
* persistence

Do not repeat the previous broad audits.

Determine the smallest architecture that can represent relationships cleanly.

---

# PHASE 1 — DEFINE RELATIONSHIP TYPES

Introduce a declarative relationship model.

At minimum support:

```text
implies
requires
excludes
```

Use the repository's actual TypeScript conventions.

A conceptual definition may look like:

```ts
relationships?: {
  implies?: string[]
  requires?: string[]
  excludes?: string[]
}
```

but adapt the exact structure to the existing catalog architecture.

Requirements:

* referenced technology IDs must exist
* relationships are deterministic
* duplicate relationships are rejected
* self-references are rejected
* invalid IDs are rejected
* relationship definitions are catalog data, not detector logic

---

# PHASE 2 — DEFINE EXACT SEMANTICS BEFORE CODING

Document the semantics explicitly before implementation.

At minimum determine:

## `implies`

If technology A is directly detected and A implies B:

```text
A detected directly
B relationship-derived
```

Does B become a detection?

Choose one explicit representation and justify it.

## `requires`

Determine whether:

```text
A requires B
```

means:

* B should be inferred when A is directly detected,
* B is only a validation constraint,
* or another deterministic semantic.

Do not leave this ambiguous.

## `excludes`

If:

```text
A excludes B
```

and both are directly observed:

Do NOT silently delete evidence.

The system must preserve enough information to explain the conflict.

Define deterministic behavior.

---

# PHASE 3 — REPRESENT DIRECT VS DERIVED DETECTIONS

The domain must distinguish:

```text
directly observed
```

from:

```text
relationship-derived
```

Do not solve this by inventing fake Evidence.

Prefer a first-class semantic representation.

For example, conceptually:

```text
Detection {
  technology
  confidence
  version?
  evidence
  source: direct | relationship
}
```

But use the repository's actual naming conventions.

The representation must make it impossible for the UI/API to accidentally present
an inferred technology as if it had direct observable evidence.

---

# PHASE 4 — EVIDENCE RULE

This invariant is mandatory:

> Only direct observations produce normal observable Evidence.

Relationship-derived detections may have:

* no observable evidence
* explicit relationship metadata
* a reference to the source detection(s)

but they must NOT claim an HTTP header/meta/script/etc. that did not match.

If useful, define explicit relationship provenance such as:

```text
derivedFrom:
  sourceTechnologyId
  relationshipType
```

Keep it minimal.

Do not create a second evidence hierarchy.

---

# PHASE 5 — RELATIONSHIP ENGINE

Create a small deterministic relationship-resolution layer.

It should operate after direct detection and before final result presentation,
or at the appropriate existing application boundary.

Do NOT put relationship traversal inside individual detectors.

Conceptually:

```text
Snapshot
   ↓
Direct detectors
   ↓
Deduplication
   ↓
Existing scoring
   ↓
Relationship resolution
   ↓
Final detection set
```

Adapt to the actual current pipeline if another placement is cleaner.

The relationship engine should:

* consume direct detections
* inspect catalog relationships
* produce derived detections/provenance
* detect conflicts
* remain deterministic

---

# PHASE 6 — TRANSITIVE RELATIONSHIPS

Support deterministic chains.

Example:

```text
A implies B
B implies C
```

If A is directly detected:

```text
A direct
B derived
C derived
```

But prevent:

* infinite loops
* duplicate derivations
* order-dependent results

Use a visited-set or equivalent deterministic graph traversal.

Do not use recursion if a simple iterative graph traversal is clearer.

---

# PHASE 7 — RELATIONSHIP CONFLICTS

Test and define behavior for:

```text
A implies B
B excludes A
```

and:

```text
A requires B
B excludes A
```

and other contradictory catalog definitions.

Catalog validation should reject impossible/contradictory definitions where this
can be established statically.

For runtime conflicts involving actual detections:

* preserve direct observations
* never fabricate evidence
* produce deterministic conflict/provenance information
* do not silently delete direct detections

Document the exact policy.

---

# PHASE 8 — EXCLUDES SEMANTICS

`excludes` must be handled conservatively.

If A directly excludes B but both are directly observed:

```text
A direct
B direct
```

do NOT automatically decide that one is false.

The observable evidence exists for both.

Instead represent the conflict explicitly.

Possible representation:

```text
relationshipConflicts
```

or equivalent metadata.

The important invariant:

> Relationship semantics must never erase real observable evidence.

If a conflict can be resolved purely from a deterministic catalog rule, document
why and test it. Otherwise preserve both observations and expose the conflict.

---

# PHASE 9 — REQUIRES SEMANTICS

`requires` must not silently become an arbitrary detector.

For example:

```text
WooCommerce requires WordPress
```

does not mean DevLens has suddenly observed WordPress.

If the source technology is directly observed, the required technology can be
represented as relationship-derived only if the chosen semantics explicitly
allow that.

If a required technology is absent, determine whether the result should:

* derive it,
* report a missing requirement,
* or only expose a validation warning.

Choose one deterministic policy.

Do not mix semantics between technologies.

---

# PHASE 10 — VERSION PROPAGATION

Do NOT invent versions for derived technologies.

Example:

```text
WooCommerce 8.5
  requires WordPress
```

This must NOT automatically produce:

```text
WordPress 8.5
```

A derived detection has:

```text
version = absent
```

unless a direct signature separately extracted a version.

Test this explicitly.

---

# PHASE 11 — CONFIDENCE / SCORING

Relationship-derived detections must not accidentally receive a fake high
confidence score.

Do not treat relationship derivation as equivalent to multiple observable
evidence types.

Define a deterministic representation.

Possible approach:

* direct detections retain existing confidence
* derived detections have a separate semantic status
* or derived detections use a neutral score that is explicitly excluded from
  direct ranking

Choose the model that best fits the current UI/API contracts.

Do not modify the existing `ConfidenceScorer` unless absolutely necessary.

If a scorer modification is genuinely required, preserve all existing scoring
invariants and explain the change in the report.

---

# PHASE 12 — CATALOG RELATIONSHIPS

Add a meaningful representative relationship set.

Do NOT add dozens of speculative relationships.

Use relationships where the semantics are well-defined and technically
defensible.

Potential examples:

```text
woocommerce → requires → wordpress
nuxt → implies → vue
nextjs → implies → react
```

But verify that each relationship is appropriate for DevLens's observable
technology model before adding it.

Do not add a relationship merely because two technologies are commonly used
together.

Distinguish:

> technically required

from:

> frequently associated.

Only the former belongs in `requires`.

---

# PHASE 13 — RELATIONSHIP CYCLES

Create catalog validation for:

* self-reference
* direct cycles
* transitive cycles

Example:

```text
A implies B
B implies A
```

Determine whether cycles are:

* invalid catalog definitions,
* allowed but safely traversed,
* or allowed for some relationship types.

Prefer rejecting semantically invalid cycles when they cannot represent useful
knowledge.

Whatever policy is chosen must be:

* deterministic
* validated
* tested
* documented

---

# PHASE 14 — RELATIONSHIP TEST MATRIX

Create focused tests.

## Direct detection

```text
A direct
```

No relationship:

```text
A only
```

## Simple implication

```text
A implies B

A direct
→ A direct
→ B derived
```

## Chain

```text
A implies B
B implies C

A direct
→ A direct
→ B derived
→ C derived
```

## Duplicate paths

```text
A implies B
A implies C
C implies B
```

B must appear once.

## Version

```text
A(version=1.2)
A implies B
```

B must not receive version 1.2.

## Evidence

B must not receive A's observable evidence as if it belonged to B.

## Requires

Test the chosen semantics explicitly.

## Excludes

Test:

* direct/direct conflict
* direct/derived conflict
* no false evidence deletion

## Determinism

Run identical input repeatedly and assert byte-equivalent semantic output.

---

# PHASE 15 — API / PERSISTENCE

Propagate relationship semantics through the existing contracts only where
necessary.

The API should expose enough information for the UI to distinguish:

* direct detection
* derived detection
* relationship provenance
* relationship conflict

Do not expose internal graph implementation details.

If persistence is required by the existing scan architecture:

* update the relevant model
* preserve legacy records
* add mapping tests
* avoid unnecessary normalization tables

If scans are persisted as JSONB and this is naturally compatible, prefer the
existing approach over introducing new relational tables.

---

# PHASE 16 — UI

Make the smallest useful UI change.

A direct detection should continue looking essentially as it does today.

A relationship-derived detection must be visually distinguishable.

For example:

```text
React
Detected
Confidence: 90
Evidence: ...
```

versus:

```text
Vue
Derived from Nuxt
Relationship: implies
No direct evidence
```

Use the existing component structure.

Do not redesign the entire scan page.

Do not add a relationship graph visualization.

Do not add dashboards.

Do not add filters.

The user must not mistake inferred information for observed evidence.

---

# PHASE 17 — REAL-WORLD REGRESSION

Reuse the existing Step 64/68 fixtures.

Existing direct detections must remain unchanged.

In particular verify:

* WordPress
* Cloudflare
* PHP
* jQuery
* Shopify
* Google Fonts
* Google Analytics
* GTM
* Next.js
* React
* Vue
* Vercel

Relationship additions must not alter established direct evidence or
confidence semantics.

If a new derived detection appears, document it explicitly.

---

# PHASE 18 — CATALOG VALIDATION

Extend the existing catalog validation.

Validate:

* unknown referenced technology ID
* duplicate relationship
* self-reference
* invalid relationship type
* impossible relationship combinations
* invalid cycles according to the chosen policy

Keep validation pure.

The real catalog must fail fast if invalid.

Add crafted-input tests for invalid definitions.

---

# PHASE 19 — SELF-AUDIT

After all tests pass, STOP coding temporarily.

Inspect the complete diff.

Audit:

### Semantic correctness

* Are direct and derived detections clearly different?
* Can inferred information accidentally look directly observed?
* Is provenance preserved?

### Evidence

* Does every direct detection retain evidence?
* Did any derived detection receive fabricated evidence?

### Versions

* Can a version leak from A to B?
* Are derived versions always absent unless independently observed?

### Scoring

* Did relationship resolution alter direct confidence?
* Are derived detections incorrectly ranked as strongly as direct observations?

### Graph

* Are chains deterministic?
* Are duplicate paths collapsed?
* Are cycles safe?
* Can a malformed catalog hang traversal?

### Excludes

* Can an `excludes` relationship erase real evidence?
* Are direct/direct conflicts visible?

### Requires

* Is "requires" being confused with "commonly used with"?

### API/UI

* Can users distinguish direct and derived information?
* Is relationship provenance understandable?
* Is confidence still clearly a deterministic score?

### Security

* No network access introduced.
* No new crawler behavior.
* No JavaScript execution.
* No SSRF changes.

Fix real defects before finalizing.

Do not invent cosmetic changes.

---

# PHASE 20 — VALIDATION

Run:

* full Vitest
* focused relationship tests
* TypeScript
* ESLint
* Prettier
* production build
* architecture/cycle check if available

If PostgreSQL integration is unavailable, state it honestly.

Pure mapping tests must still cover all new invariants.

---

# PHASE 21 — DOCUMENTATION

Create:

`docs/Step69-technology-relationship-semantics.md`

Document:

# DevLens — Step 69: Technology Relationship Semantics

## Objective

...

## Relationship model

...

## Exact semantics

### implies

...

### requires

...

### excludes

...

## Direct vs derived detection

...

## Evidence provenance

...

## Version behavior

...

## Confidence behavior

...

## Graph traversal

...

## Conflict behavior

...

## Catalog relationships added

| Source | Relation | Target | Reason |
| ------ | -------- | ------ | ------ |

Only factual/technically defensible relationships.

## Validation

...

## Tests

...

## UI/API

...

## Self-audit

### Findings

...

### Fixes

...

### Confirmed invariants

...

## Limitations

Explicitly state anything deferred.

---

# GIT

Before staging:

```bash
git status --short
git diff --stat
git diff
```

Stage ONLY Step 69 implementation/tests/documentation.

Never:

```bash
git add -A
```

Never stage:

* `.poolside/`
* `settings.local.yaml`
* `.env*`
* secrets
* runtime data
* scratch files
* unrelated docs
* Step 69 specification unless explicitly part of the requested commit

Commit exactly:

```text
Step 69: Technology Relationship Semantics
```

---

# FINAL REPORT

Return exactly:

## Step 69 Complete

### Relationship model

* ...

### Exact semantics

* implies:
* requires:
* excludes:

### Direct vs derived

* ...

### Evidence provenance

* ...

### Version behavior

* ...

### Confidence/scoring

* ...

### Relationships added

* ...

### Graph traversal

* ...

### Conflict handling

* ...

### Catalog validation

* ...

### API/UI

* ...

### Tests

* ...

### Real-world regression

* ...

### Self-audit

* Findings:
* Fixes:
* Remaining limitations:

### Validation

* Vitest:
* TypeScript:
* ESLint:
* Prettier:
* Build:
* Architecture/cycle check:

### Git

* Commit:
* Working tree:
* Intentionally excluded files:

### Files changed

* ...

STOP.

Do not start Step 70.
Do not implement browser crawling.
Do not implement DOM/CSS runtime detection.
Do not implement cookies/DNS/TLS/favicon detection.
Do not expand the catalog significantly.
Do not redesign the UI.

Step 69 ends after relationship semantics are implemented, audited, validated,
documented, and committed.
