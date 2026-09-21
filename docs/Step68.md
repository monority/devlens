# DevLens — STEP 68: Declarative Technology Signature Expansion

## OBJECTIVE

Step 67 established the first reusable declarative signature foundation:

* optional first-class technology version
* reusable version extraction
* signature-level version rules
* detector execution over existing HTTP/HTML/script observations
* deterministic version consensus
* persistence/API/UI propagation
* no change to existing scoring/ranking semantics

Step 66 showed that DevLens's catalog is still very small compared with mature
technology-detection systems.

The goal of Step 68 is now to prove that the Step 67 architecture can scale
through **declarative technology definitions**, rather than through new detector
code.

This is a REAL IMPLEMENTATION step.

The primary success criterion is:

> Adding a technology should normally require adding a declarative technology
> definition and its fixtures/tests, NOT modifying detector implementation code.

Do not attempt to reach hundreds or thousands of technologies in one step.

Instead, migrate/expand a meaningful representative batch and prove that the
architecture scales cleanly.

---

# CRITICAL PRINCIPLES

## 1. Do not rewrite the detection engine

Reuse the Step 67 foundation.

Do NOT replace the detector pipeline.

Do NOT create a second detection engine.

Do NOT introduce a plugin runtime.

Do NOT introduce dynamic code execution.

Do NOT add a dependency injection framework.

Keep the existing architecture.

---

## 2. Prefer data over code

The central question for every new technology is:

> Can this technology be represented as declarative signatures against the
> observable snapshot?

If yes, use the declarative signature system.

Do not add technology-specific branching such as:

```ts
if (technology === "foo") {
   ...
}
```

Do not add technology-specific detector classes.

Do not modify core detector logic for individual technologies.

If the existing signature abstraction cannot express a legitimate case, first
determine whether a small generic capability is missing.

Only add generic capabilities.

---

## 3. No new crawler capabilities

Do NOT implement:

* browser crawling
* Playwright
* DOM execution
* CSS runtime inspection
* cookies if they are not already available in the existing snapshot
* DNS
* TLS
* favicon hashing
* JavaScript runtime execution
* XHR inspection

Step 68 is about **catalog scalability using the signals DevLens already has**.

---

# PHASE 0 — INSPECT STEP 67

Before implementation, inspect the actual Step 67 result.

Confirm:

* current signature types
* catalog structure
* detector interfaces
* signature execution
* version extraction
* version consensus
* evidence creation
* current migrated technologies
* existing fixtures/tests

Do not repeat the Step 66 benchmark.

Do not redesign Step 67 unless a concrete defect blocks this step.

---

# PHASE 1 — DEFINE THE DECLARATIVE CATALOG CONTRACT

Establish a clean contract for a technology definition.

Use the existing domain types and naming conventions.

The definition should conceptually be able to express:

```text
Technology
├── identity
├── metadata/category
└── signatures
    ├── observable source
    ├── matching pattern
    ├── evidence metadata
    ├── optional confidence contribution
    └── optional version extraction
```

Adapt this to the actual Step 67 implementation.

Do not blindly copy this structure if the repository already has a better
equivalent.

The key requirement is separation between:

### Technology data

What identifies the technology.

and:

### Detection mechanics

How DevLens evaluates signatures.

---

# PHASE 2 — CATALOG ORGANIZATION

If the current catalog has become too centralized, improve its organization
so that technology definitions remain manageable.

The preferred direction is:

```text
catalog/
  technologies/
    wordpress.ts
    jquery.ts
    nginx.ts
    ...
```

or another equivalent structure appropriate to the repository.

However:

Do NOT split files mechanically if that creates unnecessary fragmentation.

The final structure must make it obvious:

> "This file describes this technology."

The central catalog should compose/import the definitions.

Avoid giant switch statements.

Avoid giant detector files containing technology-specific logic.

---

# PHASE 3 — TECHNOLOGY BATCH

Add a meaningful batch of real technologies.

Target approximately:

**20–30 additional technologies**, depending on the current catalog and the
quality of available deterministic signatures.

Do not artificially hit the number if signatures would be weak.

Prioritize technologies with observable signatures available through the
current pipeline.

Cover multiple categories and signal types.

Examples of useful categories include:

### CMS

* WordPress
* Drupal
* Joomla
* Ghost
* TYPO3

### JavaScript frameworks/libraries

* React
* Vue
* Angular
* Next.js
* Nuxt
* jQuery
* Lodash

### Web servers / infrastructure

* nginx
* Apache
* Microsoft IIS
* Caddy

### Analytics / marketing

* Google Analytics
* Google Tag Manager
* Matomo

### CSS/UI/frameworks

* Bootstrap
* Tailwind CSS where an observable deterministic signature exists

### E-commerce

* Shopify
* WooCommerce
* Magento / Adobe Commerce

### CDN / infrastructure

* Cloudflare
* Vercel
* Netlify where deterministic observable signatures exist

These are examples, not a mandatory list.

Use the actual repository catalog and avoid duplicating existing technologies.

Do not add a technology simply because its name is famous.

Every added technology needs an actual deterministic signature.

---

# PHASE 4 — SIGNATURE QUALITY

For each new technology:

Use the strongest available observable signatures.

Prefer, where applicable:

1. HTTP headers
2. meta tags
3. script URLs
4. script content
5. HTML markers
6. resource URLs
7. links

Use multiple independent signature types when realistic.

Do not create redundant signatures solely to inflate confidence.

Do not use extremely generic strings such as:

```text
"react"
"wordpress"
"shop"
"app"
"analytics"
```

unless the surrounding observable pattern makes the signature sufficiently
specific.

Avoid signatures that would obviously create broad false positives.

---

# PHASE 5 — VERSION EXTRACTION

Where a technology exposes a deterministic version in an observable signature,
use the Step 67 version mechanism.

Examples of legitimate sources may include:

* `/jquery-3.7.1.min.js`
* `/lodash@4.17.21/...`
* `nginx/1.24.0`
* `WordPress 6.4.2`
* explicit generator/meta versions

Do NOT guess versions.

Do NOT parse arbitrary numbers near a technology name.

Do NOT add a version merely because a fixture contains one.

If no reliable version signature exists:

```text
version = absent
```

That is correct behavior.

---

# PHASE 6 — CONFIDENCE

Do not redesign the scoring system.

Continue using the existing deterministic scorer.

Technology definitions may provide signature information required by the
existing scoring architecture, but do not create a second scoring model.

Do not copy Wappalyzer's confidence formula.

Do not introduce priority ranking.

Preserve:

```text
confidence DESC
technology.id ASC
```

and all existing Step 65 confidence semantics.

Remember:

> DevLens confidence is a deterministic ranking score, not probability.

Do not reintroduce `%`, "probably", "likely", or "certain" language.

---

# PHASE 7 — EVIDENCE

Every detection must remain explainable.

For each signature match:

* produce normal DevLens evidence
* preserve evidence identity
* preserve evidence deduplication
* preserve existing evidence presentation

Do not create technology-specific evidence types.

Do not hide the actual matched observable.

A user should still be able to understand:

> Why did DevLens detect this technology?

---

# PHASE 8 — NEGATIVE SIGNATURE TESTING

This phase is mandatory.

For each category, create at least some negative/near-miss fixtures.

Examples:

* a generic `<script>` must not imply React
* a page containing the word "shopify" in ordinary text must not automatically
  imply Shopify
* an arbitrary `analytics.js` must not automatically imply Google Analytics
* a generic `wp-content`-like string outside a real WordPress signature must be
  evaluated carefully
* generic `jquery` text should not detect jQuery unless the actual signature
  matches

Do not attempt exhaustive false-positive testing for every technology.

Instead, target the signatures most likely to be over-broad.

---

# PHASE 9 — REALISTIC FIXTURE CORPUS

Create or extend deterministic fixtures representing realistic websites.

Fixtures should contain combinations of technologies.

Examples:

### Fixture A

WordPress + nginx + PHP + jQuery

### Fixture B

Shopify + Cloudflare + Google Analytics

### Fixture C

React + Next.js + Vercel

### Fixture D

Vue + Nuxt

### Fixture E

Drupal + Apache + PHP

### Fixture F

Static site with no framework signatures

Do not require every technology to appear in every fixture.

The purpose is to ensure technologies coexist without accidental interference.

---

# PHASE 10 — DETECTION COLLISION TESTING

This is important.

Adding 20–30 technologies increases the possibility of overlapping signatures.

Create tests for collisions such as:

* jQuery vs generic JavaScript libraries
* React vs Next.js
* Vue vs Nuxt
* WordPress vs WooCommerce
* Google Analytics vs Google Tag Manager
* Cloudflare vs generic CDN signatures
* Apache vs PHP
* nginx vs unrelated server strings

The expected behavior must remain deterministic.

Do not invent new relationship semantics in this step.

If two technologies are legitimately detected independently, keep both.

If a signature is too broad, fix the signature.

Do not solve signature problems by modifying the global scorer.

---

# PHASE 11 — TECHNOLOGY RELATIONSHIPS: EXPLICITLY DEFERRED

Do NOT implement:

* `implies`
* `requires`
* `excludes`

Step 66 identified these as a future capability.

Step 68 is specifically testing whether declarative signatures can scale BEFORE
adding relationship semantics.

If a collision reveals a genuine need for relationships, document it as a
future limitation instead of implementing it here.

---

# PHASE 12 — "NEW TECHNOLOGY WITHOUT ENGINE CHANGE" TEST

This is one of the most important tests in this step.

Add at least one final technology AFTER the generic signature system is
complete.

For this final technology:

* add its catalog definition
* add its fixture
* add its test
* optionally add version extraction

Do NOT modify:

* detector implementation
* scoring implementation
* deduplication implementation
* production detector composition

The git diff for this final technology should demonstrate that adding it is
primarily declarative.

Document this explicitly in the Step 68 report.

---

# PHASE 13 — CATALOG INTEGRITY

Add validation for the catalog itself.

At minimum detect:

* duplicate technology IDs
* empty technology names
* duplicate signatures where they are clearly accidental
* invalid regex/signature definitions
* invalid version rules
* malformed technology definitions

Do not overbuild a schema framework.

A small deterministic catalog validation layer/test is enough.

The goal is to prevent the declarative catalog from becoming an uncontrolled
collection of broken definitions.

---

# PHASE 14 — PERFORMANCE / SCALE SANITY

The catalog is increasing significantly.

Run a deterministic performance sanity check.

Do NOT prematurely optimize.

Measure enough to establish that:

* the detector remains reasonably fast
* matching 20–30 additional technologies does not cause pathological behavior
* repeated detection remains deterministic

If a real performance problem appears, fix the simplest actual cause.

Do not introduce caching or concurrency merely because it might be useful later.

---

# PHASE 15 — FULL REGRESSION

All previous contracts remain mandatory.

Run:

### Detection

* existing golden fixtures
* existing real-world fixtures
* Step 67 version tests
* Step 67 signature tests
* new Step 68 fixtures
* negative tests
* collision tests

### Domain

* typecheck

### Web

* API tests
* UI rendering tests

### Persistence

* mapper tests
* PostgreSQL integration if `DATABASE_URL` is available

### Build

* production build

---

# PHASE 16 — SELF-AUDIT

After all tests pass, STOP coding temporarily.

Perform a real self-audit of the resulting architecture.

Inspect the actual diff.

Ask:

### Declarative architecture

* Can a new technology be added without detector code?
* Did any technology-specific branch sneak into core logic?
* Are definitions understandable in isolation?
* Is the central catalog still manageable?

### Detection quality

* Are signatures specific enough?
* Are there obvious false positives?
* Are overlapping technologies behaving correctly?
* Are negative fixtures meaningful?

### Version

* Are extracted versions real?
* Are versions supported by evidence?
* Are malformed versions rejected?
* Does version consensus remain deterministic?

### Evidence

* Does every detection remain explainable?
* Did any evidence disappear?
* Did deduplication behavior change?

### Scoring

* Did the scorer remain unchanged?
* Did catalog expansion accidentally change existing rankings?
* Is confidence still clearly a deterministic score?

### Performance

* Did catalog growth create pathological matching behavior?

### Security

* No new network requests.
* No SSRF changes.
* No execution of arbitrary page JavaScript.
* No unsafe regex behavior introduced intentionally.

### Maintainability

The most important question:

> Could a future contributor add a technology by editing a definition and
> tests rather than modifying detector mechanics?

If not, fix the architecture before finishing.

Fix real problems discovered during this audit.

Do not create cosmetic work.

---

# PHASE 17 — DOCUMENTATION

Create:

`docs/Step68-declarative-technology-expansion.md`

Document:

# DevLens — Step 68: Declarative Technology Signature Expansion

## Objective

...

## Catalog architecture

...

## Technologies added

Provide a table:

| Technology | Category | Signature sources | Version support |
| ---------- | -------- | ----------------- | --------------- |

## Signature examples

Show representative examples.

## Negative/near-miss testing

...

## Collision testing

...

## Catalog validation

...

## New-technology test

Explain the final technology added without modifying detector mechanics.

## Performance sanity

...

## Regression

...

## Self-audit

### Findings

...

### Fixes

...

### Confirmed invariants

...

## Limitations

Explicitly state that this step does NOT implement:

* browser runtime
* DOM
* CSS runtime
* cookies unless already available
* DNS
* TLS
* favicon hashes
* technology relationships
* large-scale external signature import

## Future directions

Document them as possibilities, not commitments.

---

# GIT

Before staging:

```bash
git status --short
git diff --stat
git diff
```

Stage ONLY Step 68 implementation/tests/documentation.

Never:

```bash
git add -A
```

Never commit:

* `.poolside/`
* `settings.local.yaml`
* `.env*`
* secrets
* runtime data
* scratch files
* unrelated docs
* the untracked Step 68 specification unless explicitly required by scope

Commit exactly:

```text
Step 68: Declarative Technology Signature Expansion
```

---

# FINAL REPORT

Return exactly:

## Step 68 Complete

### Catalog architecture

* ...

### Technologies added

* ...

### Signature coverage

* ...

### Version coverage

* ...

### Negative tests

* ...

### Collision tests

* ...

### New-technology-without-engine-change proof

* ...

### Catalog validation

* ...

### Performance sanity

* ...

### Self-audit

* Findings:
* Fixes:
* Remaining limitations:

### Regression

* Golden:
* Real-world:
* Step 67:
* Step 68:
* Total:

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

Do not start Step 69.
Do not implement browser crawling.
Do not implement DOM/CSS runtime detection.
Do not implement technology relationships.
Do not import thousands of external signatures.

The purpose of Step 68 is to prove that DevLens can grow its technology
catalog primarily through declarative signatures while keeping the detection
engine stable.
