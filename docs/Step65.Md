# DevLens — BIG STEP 65: Detection Intelligence & Explainability

## CONTEXT

Steps 62–64 are complete.

### Step 62
Found and fixed a real P1 lifecycle/UX contradiction:
failed scans could display "the scan completed successfully".

### Step 63
Found and fixed two real data-integrity bugs:

1. Evidence identity divergence caused distinct evidence values to collapse.
2. PostgreSQL persistence lost `html.links` during snapshot round-trip.

### Step 64
Exercised the REAL production detector pipeline against realistic deterministic
fixtures covering the current 24-technology catalog.

Result:

- no confirmed detector logic bugs
- scoring is deterministic
- deduplication is correct
- evidence identity is correct
- ranking is deterministic
- evidence traceability works
- realistic mixed detections work

Documented limitations remain:

- some frontend frameworks are not detectable from externalized production
  bundles when no supported marker survives
- GA4 through Google Tag Manager is not currently detected
- ScriptUrlDetector matching is less structured than LinkDetector matching

These are documented signature-coverage limitations, not confirmed bugs.

---

# STRATEGIC CHANGE

Do NOT perform another generic audit.

Do NOT invent detector features.

Do NOT redesign the detector engine.

The core detection pipeline has now received substantial validation.

The next problem is PRODUCT VALUE:

> Once DevLens has detected technologies, can a user quickly understand
> what was detected, why it was detected, how confident the detection is,
> and what evidence supports it?

The system already contains:

- technologies
- categories
- confidence
- evidence
- evidence types
- detection ordering
- scan history
- technology pages
- comparison
- evidence traceability

Use these existing capabilities.

The goal is to turn them into a coherent intelligence/explanation experience.

---

# PHASE 0 — QUICK RECONNAISSANCE

Inspect the current implementation of:

- Scan Detail
- Scan Summary
- DetectionItem
- DetectionList
- EvidenceList
- EvidenceItem
- evidence presentation utilities
- detection explainability utilities
- technology detail
- technology catalog
- comparison UI
- existing confidence presentation
- existing category presentation

Determine what is already implemented.

Do NOT repeat Step 59/61 work if the capability already exists.

Reuse existing components and utilities.

---

# PHASE 1 — DEFINE THE RESULT HIERARCHY

Establish a clear hierarchy for a user reading a scan:

## Level 1 — What was found?

Example:

- WordPress
- Cloudflare
- PHP
- jQuery

## Level 2 — How strong is the detection?

Use the existing confidence value.

Do not invent a new scoring system.

Present it consistently.

## Level 3 — Why was it detected?

Show meaningful evidence.

Examples:

- meta tag
- script URL
- resource
- link
- HTTP header
- HTML marker

## Level 4 — What does the evidence actually say?

Show the existing evidence value/source in a readable form.

The user should be able to understand the detection without reading source code.

---

# PHASE 2 — DETECTION SUMMARY

Improve the scan result summary so that a user can answer immediately:

- How many technologies were detected?
- Which categories are represented?
- How many evidence items support the result?
- Are there high-confidence detections?
- Are there weak/limited detections?

Use existing data.

Do NOT invent "accuracy" percentages.

Do NOT imply statistical certainty that the system cannot prove.

Avoid wording such as:

- "90% certain this is WordPress"
- "Definitely WordPress"
- "Verified technology"

unless the existing domain contract explicitly supports that semantics.

Prefer factual language:

- confidence score
- evidence count
- evidence types
- detected category

---

# PHASE 3 — TECHNOLOGY RESULT CARDS

Review the detection presentation.

Each detected technology should make the following immediately clear:

1. Technology name
2. Category
3. Confidence
4. Evidence count
5. Evidence type(s)
6. Expandable evidence details
7. Link to technology detail if available

Do not duplicate the evidence implementation.

Reuse:

- DetectionItem
- EvidenceList
- EvidenceItem
- existing explainability utilities

If these already provide the required hierarchy, improve presentation only where
a real usability issue exists.

---

# PHASE 4 — CONFIDENCE SEMANTICS

Audit the wording and visual presentation of confidence.

Important:

The numeric score is an internal deterministic ranking mechanism.

Do NOT falsely represent it as probability.

For example, avoid:

> "95% probability this site uses Cloudflare"

unless the domain explicitly defines confidence as probability.

Prefer:

> Confidence 95

or an equivalent neutral presentation.

If the current UI uses misleading probabilistic wording, fix it.

Add a regression test.

---

# PHASE 5 — EVIDENCE QUALITY

Review evidence presentation for readability.

Handle:

- long URLs
- long header values
- long snippets
- code-like content
- empty/optional values
- duplicate evidence
- multiple evidence types
- many evidence items

Evidence should remain:

- readable
- deterministic
- attributable to the detection
- accessible
- responsive

Do not truncate evidence in a way that prevents understanding.

If truncation is needed for UX, provide a deterministic way to access the
complete value.

---

# PHASE 6 — CATEGORY INTELLIGENCE

Use the existing technology categories to help users interpret the result.

For example:

Frontend:
- ...

Backend:
- ...

Analytics:
- ...

Infrastructure:
- ...

Do not create categories that do not exist.

Do not reorder technologies by subjective importance.

If categories are already available, group or summarize them only if this
improves comprehension without breaking the existing deterministic ranking.

Preserve the canonical detection ranking.

---

# PHASE 7 — EMPTY / WEAK RESULTS

Handle these cases explicitly.

### Zero detections

Explain factually:

- no supported technologies were detected
- this does NOT mean the site uses no technologies
- detection coverage depends on observable signatures

Do not claim the website is "technology-free".

### Weak evidence

If the existing score indicates low confidence, present it neutrally.

Do not invent thresholds unless the domain already defines them.

### Failed scan

Preserve Step 62 semantics.

Never display successful-result language for failed scans.

---

# PHASE 8 — TECHNOLOGY DETAIL CONSISTENCY

From a scan:

Detection
→ Technology Detail

The technology detail page should remain consistent with the detection:

- same technology identity
- same category
- compatible description
- compatible scan usage
- compatible evidence semantics

Do not create a second technology model.

Do not duplicate catalog data.

Use the canonical catalog.

---

# PHASE 9 — COMPARISON CONSISTENCY

Check that comparison uses the same semantics as Scan Detail.

If:

Scan A:
- WordPress
- confidence 100
- 4 evidence items

and Scan B:
- WordPress
- confidence 85
- 2 evidence items

the comparison must not imply that 85 means "85% probability".

Use the existing comparison model.

If the current presentation is misleading or inconsistent, fix it.

Do not redesign the comparison engine.

---

# PHASE 10 — REAL USER FLOW

Exercise this complete flow using existing deterministic test data:

1. Open a completed scan.
2. Read the summary.
3. Identify detected technologies.
4. Understand their categories.
5. Inspect confidence.
6. Expand evidence.
7. Open technology detail.
8. Return to scan.
9. Compare against another scan.
10. Inspect the same technology in both scans.

Look for:

- semantic inconsistencies
- confusing terminology
- duplicated information
- misleading confidence language
- broken navigation
- inconsistent evidence presentation
- accessibility problems
- responsive issues

Fix genuine issues.

---

# PHASE 11 — NO FAKE INTELLIGENCE

This is a critical constraint.

Do NOT add:

- AI-generated explanations
- guessed technology relationships
- probabilistic language
- invented accuracy
- unsupported recommendations
- "likely uses X" statements unless directly supported by the existing
  detection contract
- arbitrary technology importance rankings

DevLens should explain what it KNOWS from evidence.

It should not pretend to know more.

---

# PHASE 12 — FIX REAL ISSUES

For every confirmed issue:

1. reproduce it
2. identify the correct layer
3. fix it
4. add regression coverage
5. rerun the relevant flow

Avoid unnecessary refactors.

Do not rewrite working detection/scoring infrastructure.

Do not add new dependencies unless genuinely necessary.

---

# PHASE 13 — SELF-AUDIT

After implementation:

Review the final result as a real DevLens user.

Ask:

### Can I immediately answer:
- What technologies were detected?
- How strong is each detection?
- Why was it detected?
- What evidence supports it?
- What category does it belong to?

### Consistency
- Scan detail
- Technology detail
- Comparison
- Evidence

all use the same semantics?

### Honesty
Does any UI accidentally imply:

- probability
- certainty
- coverage completeness
- unsupported intelligence?

### Regression
Verify:

- scan creation
- scan detail
- failed scan
- zero detections
- evidence
- re-scan
- comparison
- technology navigation

If a real issue is discovered, fix it before completion.

Do not manufacture issues.

---

# PHASE 14 — VALIDATION

Run:

- focused tests
- full Vitest
- pnpm typecheck
- eslint
- prettier
- Next.js build
- madge if available

Do not create Playwright infrastructure.

Use the existing test strategy.

---

# DOCUMENTATION

Create:

`docs/Step65-report.md`

Include:

## Step 65 — Detection Intelligence & Explainability

### Existing capabilities reused
- ...

### Problems discovered
- ...

### Fixes
- ...

### Detection summary
- ...

### Confidence semantics
- ...

### Evidence presentation
- ...

### Category presentation
- ...

### Empty/failed states
- ...

### Technology detail consistency
- ...

### Comparison consistency
- ...

### Tests
- ...

### Validation
- ...

### SELF-AUDIT
- Issues found:
- Issues fixed:
- Additional tests:
- Remaining concerns:

### Final status

One of:

`EXPLAINABILITY: IMPROVED AND VALIDATED`

or

`EXPLAINABILITY: ALREADY CONSISTENT`

or

`EXPLAINABILITY: PARTIALLY VALIDATED`

---

# GIT

Only after all implementation and validation is complete:

Commit:

`Step 65: Detection Intelligence & Explainability`

The commit must contain only the actual Step 65 work.

Do not use `git add -A`.

Do not commit:

- settings.local.yaml
- environment files
- secrets
- unrelated files
- pre-existing modifications

STOP AFTER THE FINAL REPORT.

Do not start Step 66 automatically.