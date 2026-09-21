# DevLens — STEP 66: External Product & Architecture Benchmark

## OBJECTIVE

STOP IMPLEMENTATION.

Do NOT modify the DevLens product in this step.

Do NOT create another internal audit.

We have now completed Steps 62–65 and have validated the existing system
through multiple real audits:

- Step 62: real lifecycle/UI defect fixed
- Step 63: two real data-integrity defects fixed
- Step 64: production detector pipeline exercised against realistic fixtures
- Step 65: confidence/probability UX defect fixed

The current codebase is sufficiently audited that continuing to invent internal
audit steps is likely to produce diminishing returns.

We now need external information.

The goal of this step is:

> Understand what mature/open-source technology-detection products actually
> do internally and at the product level, then compare them objectively with
> DevLens.

This is RESEARCH / REVERSE ENGINEERING ONLY.

NO PRODUCT IMPLEMENTATION.

---

# PHASE 0 — CURRENT DEVlENS BASELINE

Before looking externally, briefly establish the current DevLens capability
baseline from the actual repository.

Document:

### Detection

- supported technologies
- detectors
- evidence types
- scoring
- deduplication
- persistence

### Product

- scan creation
- scan history
- scan detail
- comparison
- technology catalog
- technology detail
- evidence presentation

### Infrastructure

- crawler
- detector pipeline
- database
- API
- frontend
- testing

Do not audit correctness again.

This is only a capability inventory.

---

# PHASE 1 — IDENTIFY REFERENCE PROJECTS

Find several relevant PUBLIC projects/products.

Prioritize projects that provide accessible source code, documentation,
technology signatures, or architectural information.

Potential categories:

### A — Open-source technology detection

Examples may include projects similar to:

- Wappalyzer
- WhatRuns
- BuiltWith-style open implementations
- WhatWeb
- web technology fingerprinting libraries

### B — Detection/signature engines

Look for projects with:

- technology signatures
- evidence rules
- confidence/ranking
- pattern matching
- detector composition

### C — Scan/crawler architectures

Look for projects with:

- HTTP crawling
- HTML/resource extraction
- technology identification
- result persistence
- API output

Do NOT assume these projects are better.

We are investigating them.

---

# PHASE 2 — DOWNLOAD / INSPECT PUBLIC SOURCE

For each useful reference project where source is publicly available:

Inspect the actual repository/code.

Do not rely exclusively on README marketing claims.

Look at:

- directory structure
- technology definitions
- signature format
- detector architecture
- evidence representation
- confidence model
- crawler architecture
- normalization
- deduplication
- extensibility
- tests
- fixtures
- update mechanisms

If source cannot be downloaded or inspected:

document that limitation and use authoritative documentation instead.

Do not fabricate findings.

---

# PHASE 3 — TECHNOLOGY SIGNATURE SYSTEM

This is a major focus.

Compare how reference projects represent technology signatures.

Look for:

- headers
- meta tags
- script URLs
- HTML patterns
- JavaScript globals
- cookies
- DNS
- TLS
- redirects
- resource URLs
- links
- DOM markers
- favicon hashes
- asset fingerprints
- version extraction
- confidence
- relationships/dependencies

Compare these against DevLens.

Do NOT judge them as better/worse.

Document:

| Capability | DevLens | Reference A | Reference B | Reference C |
|---|---|---|---|---|

---

# PHASE 4 — DETECTION DEPTH

Determine which observable signals mature systems use that DevLens does not
currently inspect.

Especially investigate:

- cookies
- response body patterns
- JavaScript globals
- DOM signatures
- CSS signatures
- favicon hashes
- DNS signals
- TLS/certificate signals
- redirects
- server behavior
- asset naming conventions
- version extraction
- technology relationships

For each capability determine:

1. Does DevLens support it?
2. Does the reference project support it?
3. What evidence would it provide?
4. Would implementing it require crawler changes?
5. Would it require a new evidence type?
6. Would it affect SSRF/security boundaries?
7. Would it affect persistence/API contracts?

Do NOT implement anything.

---

# PHASE 5 — RESULT / PRODUCT EXPERIENCE

Inspect how reference products present results.

Compare:

- technology lists
- confidence
- evidence
- categories
- versions
- relationships
- historical scans
- comparisons
- changes between scans
- technology stacks
- export
- reports
- APIs

Again:

Do not copy UX blindly.

Document actual capabilities.

---

# PHASE 6 — EXTENSIBILITY

This is particularly important for DevLens.

Investigate how reference projects add a new technology.

Questions:

- How many files must change?
- Is a technology definition declarative?
- Are detection rules data-driven?
- Can new signatures be added without changing detector code?
- Are signatures versioned?
- How are conflicts handled?
- How are tests generated?
- Can contributors add technologies independently?

Compare against DevLens's current catalog/detector structure.

---

# PHASE 7 — TEST / FIXTURE STRATEGY

Inspect how mature projects validate detection.

Look for:

- real-world fixtures
- HTML fixtures
- header fixtures
- expected technology snapshots
- false-positive tests
- false-negative tests
- regression suites
- live-site tests
- corpus testing
- signature validation

Compare this with DevLens.

---

# PHASE 8 — ARCHITECTURAL DIFFERENCES

Produce a concrete comparison.

For each major difference:

- Current DevLens approach
- Reference approach
- Why the reference uses it
- Potential benefit
- Potential complexity
- Whether it is relevant to DevLens

Do NOT label something "better" without evidence.

---

# PHASE 9 — FIND THE REAL NEXT LEVER

Based on the investigation, identify the major capability gaps.

Categorize them:

### Category A — Detection coverage

Capabilities DevLens cannot currently observe.

### Category B — Detection quality

Capabilities where existing observations could be interpreted better.

### Category C — Product

Capabilities users of technology-detection tools commonly expect.

### Category D — Architecture

Capabilities needed to scale the signature catalog.

### Category E — Infrastructure

Crawler/network capabilities needed for future detection.

For each item provide:

- evidence from reference implementation
- DevLens current state
- expected impact
- implementation complexity
- architectural consequences

Do NOT rank or score them.

Do NOT choose a winner.

This is a factual engineering comparison.

---

# PHASE 10 — IMPORTANT: NO IMPLEMENTATION

Do NOT:

- modify detectors
- modify the database
- modify the API
- modify the UI
- add new technologies
- refactor DevLens
- create Step 67 automatically

The only allowed DevLens changes are documentation generated specifically
for this benchmark.

---

# PHASE 11 — FINAL DELIVERABLE

Create:

`docs/Step66-reference-benchmark.md`

It must contain:

# DevLens — External Product & Architecture Benchmark

## Current DevLens baseline

...

## Reference projects

For each:

- project
- repository
- license if relevant
- architecture
- detection model
- signature system
- testing approach

## Detection signal comparison

| Signal | DevLens | Reference A | Reference B | Notes |
|---|---|---|---|---|

## Technology signature comparison

...

## Evidence model comparison

...

## Confidence/ranking comparison

...

## Crawler comparison

...

## Result/product comparison

...

## Extensibility comparison

...

## Testing/fixture comparison

...

## Concrete capability gaps

For every gap:

- Current state
- Reference evidence
- What would be required
- Architectural impact
- Unknowns

## Potential future directions

Separate these clearly from facts.

Do not implement them.

---

# SOURCE QUALITY

Use actual source code whenever available.

For external projects:

- provide repository URLs
- identify exact files/directories inspected
- distinguish source facts from interpretation
- do not rely on random blog posts when source code is available

If a repository cannot be accessed, say so.

Do not pretend to have inspected code that was not actually accessible.

---

# GIT

Commit ONLY the benchmark documentation:

`Step 66: External Product & Architecture Benchmark`

Do not use `git add -A`.

Do not commit:

- settings.local.yaml
- environment files
- secrets
- unrelated files
- generated runtime data

---

# FINAL REPORT

Return:

## Step 66 Complete

### References inspected
- ...

### DevLens baseline
- ...

### Major capability differences
- ...

### Detection signal differences
- ...

### Signature architecture differences
- ...

### Product differences
- ...

### Extensibility differences
- ...

### Testing differences
- ...

### Concrete gaps
- ...

### Recommended investigation areas
- ...

### Sources
- ...

### Validation
- documentation checked
- repository state
- commit

### Commit
- hash

STOP.

Do not implement anything from the benchmark.