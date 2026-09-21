# DevLens — Step 70: HTTP Resource Intelligence

## Context

DevLens HEAD is:

* `792dfad` — `Step 69: Technology Relationship Semantics`
* Step 68 established the declarative technology catalog.
* Step 69 established declarative `implies` / `requires` / `excludes` relationship semantics.

The current architecture is HTTP-first and server-side.

Current observable sources include:

* response headers
* meta
* script URLs
* HTML/content
* resources
* links

The current crawler/snapshot model does **not** yet provide a deliberate secondary-resource acquisition layer.

The purpose of this step is to introduce that layer.

---

# Objective

Build a deterministic, security-conscious **HTTP Resource Intelligence** layer that:

1. discovers potentially useful secondary resources from an HTML page;
2. classifies them;
3. selects only relevant resources according to explicit deterministic policies and budgets;
4. safely fetches selected resources;
5. exposes their observations through the domain snapshot;
6. preserves the existing detector architecture;
7. preserves existing direct-detection behavior;
8. provides a foundation for future JS/CSS/content-based detection.

This is an **observation infrastructure step**.

Do NOT turn this step into a major detector/signature expansion.

---

# Critical architectural rule

Maintain this separation:

```text
HTTP crawler
    ↓
raw HTTP facts
    ↓
resource discovery
    ↓
resource selection policy
    ↓
resource acquisition
    ↓
normalized resource observations
    ↓
SiteSnapshot
    ↓
existing detector pipeline
```

The crawler/resource layer collects facts.

Detectors interpret facts.

Do not add technology-specific detection logic to the crawler.

---

# Scope

Implement all of the following.

## 1. Resource observation model

Introduce an explicit domain representation for a secondary HTTP resource.

The exact names are yours to choose, but the model must be conceptually capable of representing:

* canonical URL
* resource kind
* HTTP status
* content type / MIME type
* response size
* relevant response headers
* body/content when allowed by policy
* source page URL
* acquisition status
* failure reason when acquisition failed

Resource kinds should at minimum distinguish:

```text
script
stylesheet
image
font
favicon
other
```

Do not assume every discovered URL is a downloadable resource of interest.

The model must distinguish:

* discovered resource
* selected resource
* successfully fetched resource
* failed/skipped resource

Do not silently turn failures into successful observations.

---

# 2. Resource discovery

Extend HTML analysis so DevLens can discover secondary resources from the primary document.

At minimum inspect:

### Scripts

```html
<script src="...">
```

### Stylesheets

```html
<link rel="stylesheet" href="...">
```

### Favicon candidates

Support the relevant favicon link forms, including:

```html
<link rel="icon" ...>
<link rel="shortcut icon" ...>
```

### Other resource candidates

If the existing HTML parser already exposes additional resource references, reuse that infrastructure where appropriate.

Do not introduce a second unrelated HTML parser without justification.

Normalize discovered URLs using the existing URL/security conventions.

Resolve relative URLs correctly against the document URL.

Deduplicate canonical resource URLs deterministically.

---

# 3. Resource classification

Create a small deterministic classifier.

Classification may use:

* HTML element/source context
* URL path/extension
* declared MIME type when known
* response Content-Type after acquisition

Do not rely solely on file extensions.

Classification must be deterministic.

If classification is ambiguous, preserve the resource as `other` rather than inventing a type.

---

# 4. Intelligent selection policy

This is the central feature of Step 70.

Do NOT download every discovered resource.

Create an explicit resource-selection policy.

The policy must have deterministic limits.

At minimum support:

* maximum total secondary resources per scan;
* maximum resources per kind;
* maximum response/body size;
* request timeout;
* deterministic priority/order.

The exact default numbers should be justified in the implementation/docs.

Selection should prioritize resources that are technically useful for future technology detection.

A reasonable priority concept is:

```text
script
stylesheet
favicon
other
```

Images/fonts should generally not consume the main intelligence budget unless the policy explicitly allows them.

Do not hard-code arbitrary behavior inside the HTTP client.

The selection policy should be independently testable.

---

# 5. Same-origin and external resources

Define explicit behavior for external resources.

Example:

```text
https://example.com/
    ├── /assets/app.js              same-origin
    ├── https://cdn.example.com/a.js
    └── https://fonts.googleapis.com/...
```

The implementation must not accidentally create an SSRF bypass simply because a URL was found inside HTML.

Reuse the existing SSRF validation/security boundary.

Every secondary request must pass the same appropriate network-security checks as the primary request.

Document whether external resources are:

* allowed by default;
* restricted;
* allowed only under a separate budget.

Do not silently broaden the crawler's security boundary.

If redirects occur, validate the resulting destination as appropriate rather than assuming the original URL remains safe.

---

# 6. Secondary request budgets

Implement explicit scan-level resource budgeting.

The budget must prevent a malicious or pathological page from causing unbounded work.

At minimum protect against:

* huge numbers of `<script>` tags;
* huge numbers of stylesheet links;
* duplicate URLs;
* very large responses;
* slow responses;
* redirect chains;
* repeated resources referenced multiple times.

Prefer a single coherent budget abstraction rather than scattering constants across the crawler.

The policy should make it possible to answer:

> "Why was this resource downloaded while another one was skipped?"

---

# 7. Resource acquisition

Implement safe HTTP acquisition for selected resources.

Reuse existing HTTP infrastructure wherever possible.

Do not create a second HTTP client stack unless technically necessary.

The acquisition layer must support:

* timeout
* response status
* content type
* body-size limit
* redirect handling consistent with SSRF rules
* deterministic failure representation

For textual resources such as JavaScript/CSS, preserve their body when within the configured limit.

For binary resources such as favicon, do not unnecessarily decode them as text.

Do not store unbounded bodies.

---

# 8. Favicon support

Add a bounded favicon observation.

At minimum:

* discover favicon candidates;
* fetch selected favicon candidates subject to budget/security rules;
* preserve URL;
* status;
* content type;
* bounded bytes;
* deterministic identity/hash if useful and justified.

Do not build a full favicon fingerprint database in this step.

The purpose is to make the favicon observable infrastructure available for later detection work.

---

# 9. JavaScript and CSS bodies

Make bounded JS/CSS response bodies available as observations.

This is important.

The next detection step must be able to answer things such as:

```text
"Was this JavaScript file downloaded?"
"What was its content?"
"What URL did it come from?"
```

But Step 70 must NOT start implementing dozens of technology signatures against those bodies.

Only establish the observation contract.

Avoid parsing JavaScript into an AST unless genuinely required for the observation contract.

Avoid executing JavaScript.

Avoid browser APIs.

---

# 10. SiteSnapshot evolution

Extend the snapshot model in a backwards-compatible manner.

Existing snapshots and existing detector inputs must remain valid.

Do not break current fixtures unnecessarily.

The snapshot should clearly distinguish:

```text
primary document
secondary resource observations
```

Do not flatten everything into the existing `html` object if that would destroy provenance.

A detector must be able to tell that a signal came from:

```text
https://example.com/
```

versus:

```text
https://example.com/assets/app.js
```

---

# 11. Detector compatibility

Do NOT redesign the six existing detectors.

Do NOT redesign scoring.

Do NOT redesign deduplication.

Do NOT redesign relationship resolution.

The existing pipeline must remain:

```text
CompositeDetector
    ↓
DeduplicatingDetector
    ↓
ScoringDetector
    ↓
RelationshipResolver
```

Step 70 only enriches the observations available to that pipeline.

Existing direct detections must not disappear because the snapshot gained new resource data.

---

# 12. Evidence provenance

Do not fabricate evidence.

If a future detector says:

```text
React detected from app.js
```

the architecture must make it possible to identify the actual resource URL and relevant observation.

But Step 70 itself must not invent a `Detection`.

Resource observations are facts.

Technology interpretation remains detector responsibility.

---

# 13. Security requirements

Perform a specific SSRF/security review.

Consider:

* private IPs
* loopback
* localhost
* link-local addresses
* IPv4/IPv6 variants
* redirects
* DNS rebinding assumptions
* unusual URL schemes
* malformed URLs
* external resource hosts
* oversized responses
* excessive resource counts

Reuse existing security utilities where possible.

Do not claim protection against a class of attacks unless the implementation actually provides it.

If the current SSRF guard has known limitations, document them rather than pretending Step 70 solved them.

---

# 14. Determinism

The resource subsystem must be deterministic.

Given the same snapshot:

```text
discover()
select()
```

must produce the same ordered resources.

Given deterministic HTTP fixtures:

```text
acquire()
```

must produce deterministic normalized observations.

Resource ordering must not depend on:

* object key enumeration accidents;
* completion order;
* Promise timing;
* network completion race.

Use explicit stable ordering.

---

# 15. Caching / duplicate requests

Within a single scan, identical canonical resource URLs must not be fetched multiple times.

Implement a bounded per-scan resource cache or equivalent deduplication mechanism.

Do not introduce a persistent cross-scan cache unless the existing architecture already supports one and the spec genuinely requires it.

Keep the scope to per-scan correctness and efficiency.

---

# 16. Tests

Add comprehensive deterministic tests.

At minimum cover:

### Discovery

* relative script URL
* absolute script URL
* relative stylesheet URL
* favicon
* duplicate references
* malformed references
* URL normalization

### Classification

* JS
* CSS
* favicon
* image
* font
* unknown/other
* MIME overriding extension where appropriate

### Selection

* total budget
* per-kind budget
* deterministic priority
* deterministic ordering
* skipped resources
* duplicate resources

### Acquisition

* successful JS
* successful CSS
* successful favicon/binary
* non-2xx response
* timeout
* oversized body
* redirect
* redirect to blocked destination
* malformed response where relevant

### Security

* localhost/private target
* blocked redirect
* external resource policy
* unusual URL schemes
* duplicate/abusive resource lists

### Snapshot

* round-trip mapping
* backward compatibility
* primary vs secondary provenance
* bounded body preservation

### Pipeline regression

Verify that the existing direct detections from the Step 68/69 real-world fixtures remain unchanged.

Especially preserve:

```text
WordPress
Cloudflare
PHP
jQuery

Shopify
Google Fonts
Google Analytics
Google Tag Manager

Next.js
React
Vue
Vercel
```

Do not accept "tests pass" as sufficient if an existing detection disappeared.

---

# 17. Realistic integration fixtures

Create deterministic HTTP fixtures representing at least:

## Fixture A — modern application

HTML references:

```text
app.js
runtime.js
styles.css
favicon.ico
```

Verify:

* resource discovery
* selection
* acquisition
* provenance
* body limits

## Fixture B — resource-heavy page

Many scripts/styles/images/fonts.

Verify:

* budget enforcement
* deterministic selection
* no duplicate downloads
* irrelevant resources do not consume the intelligence budget unexpectedly

## Fixture C — malicious/pathological page

Includes:

* duplicate resources
* malformed URLs
* blocked destinations
* redirect to private address
* oversized response
* excessive resource count

Verify that the scan remains bounded and safe.

---

# 18. Performance

Measure at least:

* discovery cost
* selection cost
* bounded acquisition cost
* number of secondary requests

Do not optimize prematurely.

But prove that a page with hundreds/thousands of references cannot trigger unbounded secondary work.

---

# 19. Documentation

Create:

```text
docs/Step70-http-resource-intelligence.md
```

Document:

* architecture
* resource model
* discovery rules
* classification
* selection policy
* budgets
* same-origin/external-resource behavior
* SSRF/security boundary
* redirect behavior
* body limits
* determinism
* caching/deduplication
* backward compatibility
* known limitations
* why JavaScript execution/browser crawling is intentionally out of scope

---

# Explicit non-goals

Do NOT implement:

* Playwright
* browser crawling
* JavaScript execution
* DOM runtime inspection
* CSSOM
* cookies as a new detection engine
* DNS fingerprinting
* TLS fingerprinting
* technology-specific JS signatures at scale
* large catalog expansion
* new relationship semantics
* scoring redesign
* confidence redesign
* persistent cross-scan resource cache
* Step 71 work
* Step 72 work

This step is about **observing resources safely and intelligently**, not interpreting all of them yet.

---

# Self-audit requirement

Before declaring completion, perform a focused self-audit.

Inspect:

### Architecture

* Is resource acquisition cleanly separated from detection?
* Is the crawler still responsible for facts rather than technology interpretation?
* Is the snapshot model coherent?

### Security

* Can HTML force arbitrary internal requests?
* Are redirects revalidated?
* Can resource counts or response sizes become unbounded?
* Are external resources handled intentionally?

### Determinism

* Is discovery deterministic?
* Is selection deterministic?
* Is acquisition normalization deterministic?
* Is completion order irrelevant?

### Correctness

* Are relative URLs resolved correctly?
* Are duplicates eliminated?
* Are MIME types handled correctly?
* Are binary resources preserved correctly?
* Are failures represented as failures?

### Compatibility

* Do existing snapshots still deserialize?
* Do existing detectors behave identically?
* Did any existing direct detection disappear?

### Scope

* Did you accidentally implement browser/runtime behavior?
* Did you add technology-specific detection that belongs in Step 71?
* Did you introduce unnecessary migrations?

If the self-audit finds a real defect, fix it before the final report.

Do not merely document an obvious defect and call the step complete.

---

# Validation gate

Run:

```text
pnpm exec vitest run
pnpm typecheck
pnpm exec eslint .
pnpm exec prettier --check .
pnpm build
```

Also perform the project's available architecture/cycle check.

If a database integration suite is unavailable because of missing infrastructure, report that explicitly rather than pretending it ran.

---

# Git rules

Create:

```text
docs/Step70-http-resource-intelligence.md
```

Commit only files belonging to Step 70.

Never commit:

```text
.poolside/
settings.local.yaml
.env*
```

Do not use:

```text
git add -A
```

Do not include unrelated prior/excluded spec files.

Commit message must be exactly:

```text
Step 70: HTTP Resource Intelligence
```

Leave the working tree clean except for intentionally excluded/untracked files.

---

# Final report

Return exactly this structure:

## Step 70 Complete

### Resource model

### Discovery

### Classification

### Selection policy

### Budgets

### Acquisition

### Favicon

### JS/CSS observations

### Security / SSRF

### Redirect handling

### Determinism

### Per-scan deduplication

### Snapshot/API compatibility

### Detector compatibility

### Tests

### Real-world regression

### Performance

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

Do not start Step 71 or any browser/runtime work after completing Step 70.
