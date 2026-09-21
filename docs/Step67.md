# DevLens — STEP 67: Detection Intelligence Foundation

## OBJECTIVE

We are now moving from internal audits to real product evolution.

Step 66 was a research-only benchmark against mature/public technology-detection
projects, especially Wappalyzer and WhatWeb.

The benchmark established several concrete architectural differences:

* DevLens currently has 32 technologies.
* Detection is based on 8 evidence types.
* Detection is implemented through composed TypeScript detectors.
* The technology catalog is still relatively code-centric.
* Detection has no first-class version.
* Technologies have no first-class relationship semantics.
* Wappalyzer demonstrates a declarative signature model with:

  * patterns
  * confidence
  * version extraction
  * implies
  * excludes
  * requires
* Mature systems also make it easier to add many signatures without modifying
  detector implementation code for every technology.

The purpose of Step 67 is NOT to implement every capability found in Step 66.

The purpose is to establish the first solid foundation for a more expressive
detection model while preserving everything that already works.

This is a REAL IMPLEMENTATION step.

Work in one coherent milestone.

---

# CRITICAL PRINCIPLES

## 1. Preserve the current architecture

Do not rewrite DevLens.

Reuse the existing:

* domain/application/infrastructure boundaries
* detector pipeline
* technology catalog
* evidence model
* scoring system
* persistence layer
* API contracts
* existing UI components
* test infrastructure

Do not introduce a parallel detection engine.

Do not create unnecessary abstractions.

---

# 2. Do not blindly copy Wappalyzer

Step 66 was a benchmark, not a specification.

Use the reference projects to understand the problem.

DevLens must retain its own:

* TypeScript architecture
* deterministic behavior
* explainable evidence
* explicit domain boundaries
* testability
* SSRF protections

Only introduce concepts that fit the existing architecture.

---

# 3. Preserve existing behavior

All existing detection behavior must remain valid unless this step explicitly
extends it.

In particular preserve:

* evidence identity canonicalization
* evidence deduplication
* confidence scoring
* deterministic ranking
* technology IDs
* API serialization
* persistence behavior
* scan lifecycle
* SSRF protection
* existing catalog detections

Do not weaken existing tests just to make the new architecture fit.

---

# 4. No browser crawler yet

Do NOT implement:

* Playwright crawling
* Chromium crawling
* DOM execution
* CSS runtime inspection
* browser automation
* DNS/TLS reconnaissance
* favicon hashing

Those are future milestones.

This step should work entirely with the current observable HTTP/HTML/script
pipeline.

---

# PHASE 0 — BASELINE

Before changing code, inspect the current implementation.

Confirm the actual current structures for:

* Technology
* Detection
* Evidence
* technology catalog
* detector interfaces
* production detector
* scoring
* persistence
* API response mapping
* technology detail UI
* tests

Do not perform another broad audit.

This is implementation preparation.

---

# PHASE 1 — FIRST-CLASS DETECTION VERSION

Introduce a first-class optional technology version on detections.

The intended conceptual shape is:

```ts
Detection {
  technology
  confidence
  version?
  evidence
}
```

Use the repository's actual existing types and naming conventions.

Requirements:

* version is optional
* existing detections without a version remain valid
* version must be deterministic
* version must be explainable by evidence
* do not infer versions from arbitrary text
* do not expose a version unless a technology-specific signature actually
  supports extracting it

Do NOT make version mandatory.

Do NOT create a generic "guess the version" heuristic.

---

# PHASE 2 — VERSION EXTRACTION AS SIGNATURE DATA

The important architectural goal is:

> A technology should be able to declare how its version can be extracted from
> observable evidence without requiring a new detector implementation.

Inspect the existing catalog and detector architecture.

Introduce the smallest suitable abstraction allowing a technology definition
to declare version extraction rules.

Potential observable sources include the existing evidence types:

* HTTP headers
* meta tags
* script URLs
* script content
* HTML
* resources
* links

Do not add new evidence types in this step.

Do not force every technology to have a version rule.

A signature should be able to express something conceptually equivalent to:

```text
source
pattern
version extraction
```

but adapt the exact representation to DevLens's existing architecture.

---

# PHASE 3 — DECLARATIVE SIGNATURE FOUNDATION

The benchmark showed that mature systems separate technology signatures from
the mechanics that execute them.

Move DevLens one meaningful step in that direction.

The goal is NOT to rewrite every existing detector.

The goal is to establish a reusable signature representation for at least the
existing HTTP/HTML/script observations.

The abstraction should support technology definitions that can declare:

* observable source
* matching pattern
* optional version extraction
* optional evidence metadata
* optional base confidence contribution

The detector implementation should remain responsible for:

* reading the snapshot
* evaluating signatures
* producing evidence
* preserving deterministic behavior

Avoid creating one detector class per technology.

---

# PHASE 4 — USE THE FOUNDATION ON A REAL SUBSET

Do not migrate all 32 technologies blindly.

Choose a representative subset from the current catalog covering several
existing signal types.

For example, include technologies that are currently detected through:

* HTTP headers
* meta tags
* script URLs
* script content
* HTML
* resources/links

Use the actual catalog and choose technologies where declarative signatures
are a natural fit.

At least some migrated technologies must support version extraction.

At least one must demonstrate:

* positive detection
* extracted version
* evidence
* deterministic repeated execution

Do not fabricate version numbers in fixtures.

Use realistic fixture content that contains an actual version signature.

---

# PHASE 5 — SIGNATURE EXECUTION

Implement the minimum execution layer required to evaluate the new signatures.

Requirements:

### Determinism

Same snapshot + same catalog = same detections.

### Evidence

A signature match must still produce normal DevLens evidence.

Do not create a second evidence representation.

### Deduplication

Existing `DeduplicatingDetector` behavior must remain valid.

### Scoring

Do not replace the current scoring system in this step.

If signature confidence needs to feed the existing scorer, integrate it without
changing the current ranking semantics unnecessarily.

### Ranking

Preserve:

```text
confidence DESC
technology.id ASC
```

unless an explicit existing contract requires otherwise.

Do not introduce priority ranking from Wappalyzer yet.

---

# PHASE 6 — VERSION CONSISTENCY

Define and test the behavior when:

* multiple signatures extract the same version
* multiple signatures extract different versions
* a signature matches but version extraction fails
* version text is malformed
* version contains surrounding whitespace
* multiple detections of the same technology are deduplicated

The rules must be:

* deterministic
* documented
* testable
* conservative

Do not invent a probabilistic version resolver.

If the repository already has a natural precedence mechanism, reuse it.

Otherwise define a small deterministic rule and document it.

---

# PHASE 7 — PERSISTENCE

If Detection currently gets persisted, propagate the optional version through:

* domain → persistence
* database schema if required
* migrations
* row mapping
* API serialization
* API response types

Existing records without versions must continue to load correctly.

Migration requirements:

* safe default for existing rows
* no destructive migration
* no data loss
* deterministic mapper tests

If the current database persistence does not actually persist detections
directly, follow the real architecture rather than inventing a new table.

---

# PHASE 8 — PRODUCT SURFACE

Expose version only where the current product already presents technology
detection information.

Update the smallest necessary surfaces:

* scan detail
* detection item
* comparison if comparison already exposes the Detection object
* technology detail only if there is an existing natural place for detected
  versions

Do not redesign the UI.

Do not add dashboards.

Do not add filters.

Do not add new navigation.

Version should be visually subordinate to:

1. technology name
2. confidence
3. evidence

Avoid presenting version as certainty beyond what the signature actually
establishes.

---

# PHASE 9 — TESTING

Add focused tests for the new foundation.

At minimum cover:

## Signature matching

* positive match
* negative match
* multiple signatures
* multiple technologies
* deterministic execution

## Version extraction

* valid version
* missing version
* malformed version
* whitespace normalization
* conflicting version signatures
* deterministic resolution

## Evidence

* signature match produces expected evidence
* existing evidence identity still works
* duplicate evidence remains deduplicated

## Scoring

* existing scoring behavior remains unchanged
* signature confidence does not accidentally alter unrelated detections

## Persistence

* version survives mapping
* legacy detection without version survives mapping

## API

* version is serialized when present
* version is omitted/null according to the existing API convention when absent

## UI

* version renders when available
* no version renders when unavailable

---

# PHASE 10 — REGRESSION AGAINST REAL-WORLD FIXTURES

Reuse the Step 64 real-world fixtures.

The following existing scenarios must continue to work:

* WordPress + Cloudflare + PHP + jQuery
* Shopify + Cloudflare + Google Fonts + Google Analytics
* negative cases already documented

Do not weaken the expected technology rankings merely because the new
signature system is being introduced.

If a migrated technology changes ranking, investigate why.

Only accept a ranking change when it is an intentional consequence of the new
signature semantics and document it.

---

# PHASE 11 — SELF-AUDIT

After implementation and tests pass, STOP coding temporarily.

Perform a dedicated post-implementation audit.

Inspect the actual resulting code for:

### Architecture

* Is there one detection pipeline?
* Did we accidentally create two competing signature systems?
* Are catalog definitions separated from execution mechanics?
* Did unnecessary abstractions appear?

### Domain

* Is version genuinely optional?
* Is the type consistent across domain/API/persistence?
* Can a malformed version enter the domain?

### Evidence

* Does every extracted version have explainable evidence?
* Can evidence identity still distinguish separate observations?

### Determinism

* Same snapshot produces identical detection/version output.
* No object iteration order leaks into results.
* No random/time-dependent behavior.

### Persistence

* Existing rows remain readable.
* Version cannot silently disappear during mapping.

### Product

* No false `%` confidence display.
* No "probability" wording.
* No misleading certainty around versions.

### Security

* No SSRF boundary changes.
* No new arbitrary network requests.
* Signature execution operates only on already-observed snapshot data.

### Maintainability

* Adding a new signature should not require modifying core detector logic.
* Existing technologies should remain easy to understand.

If you find real defects, FIX THEM before producing the final report.

Do not invent cosmetic work.

---

# PHASE 12 — FINAL VALIDATION

Run the complete relevant validation suite.

At minimum:

* Vitest
* TypeScript
* ESLint
* Prettier
* production build
* existing architecture/cycle check if available

Also run the focused Step 67 tests separately if useful.

If PostgreSQL integration is unavailable, report that honestly and ensure pure
mapping tests cover the invariant.

Do not claim browser validation because no browser E2E infrastructure exists.

---

# PHASE 13 — DOCUMENTATION

Create:

`docs/Step67-detection-intelligence-foundation.md`

Document:

## Step 67 — Detection Intelligence Foundation

### Objective

...

### Existing architecture used

...

### Version model

...

### Signature model

...

### Signature execution

...

### Technologies migrated

List every migrated technology and explain why it was selected.

### Version extraction examples

Document actual fixtures/signatures used.

### Persistence changes

...

### API changes

...

### UI changes

...

### Tests

...

### Compatibility

Explain how existing detections remain compatible.

### Self-audit

List:

* findings
* fixes
* confirmed invariants

### Validation

...

### Limitations

Explicitly state what is NOT implemented:

* browser runtime
* DOM inspection
* CSS runtime inspection
* cookies if not already observable
* DNS
* TLS
* favicon hashing
* relationship semantics
* large-scale catalog expansion

Do not pretend Step 67 solved Step 66's entire benchmark.

---

# GIT

Before staging:

```bash
git status --short
git diff --stat
git diff
```

Stage ONLY files belonging to Step 67.

Never use:

```bash
git add -A
```

Never stage:

* `.poolside/`
* `settings.local.yaml`
* `.env*`
* secrets
* runtime data
* unrelated changes
* scratch files
* temporary benchmark material

Commit:

```text
Step 67: Detection Intelligence Foundation
```

---

# FINAL REPORT

Return exactly this structure:

## Step 67 Complete

### Implementation

* ...

### Version model

* ...

### Signature architecture

* ...

### Technologies migrated

* ...

### Version extraction

* ...

### Persistence/API/UI

* ...

### Tests

* ...

### Regression results

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
* Untracked files intentionally excluded:

### Files changed

* ...

STOP.

Do not start Step 68.
Do not implement browser crawling.
Do not implement DOM/CSS runtime detection.
Do not expand the entire catalog.
Do not add technology relationships.

Step 67 ends after the foundation is implemented, audited, validated, and
committed.
