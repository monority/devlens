# DevLens — BIG STEP 64: Real-World Detection Audit

## CONTEXT

Step 63 is complete.

Commit:
`c932050 Step 63: Scan Data Integrity & Detection Reliability`

Step 63 found and fixed two genuine data-loss defects:

1. Evidence identity divergence caused distinct evidence values such as
   `Server: nginx` and `Server: Apache` to collapse into one item.
2. PostgreSQL persistence lost `html.links` during snapshot round-trip.

The data pipeline is now substantially hardened.

We now change focus again.

The next question is:

> Does DevLens actually detect technologies correctly when confronted with
> realistic web pages and realistic HTML observations?

This is NOT a UI feature step.

This is NOT another generic architecture audit.

This is a REAL-WORLD DETECTION AUDIT.

---

# PRIMARY OBJECTIVE

Exercise the complete detection pipeline against representative realistic
website inputs.

Trace:

HTML / HTTP observations
→ individual detectors
→ CompositeDetector
→ DeduplicatingDetector
→ ScoringDetector
→ final Detection[]

and determine whether the final result is:

- correct
- complete enough
- deterministic
- free of obvious false positives
- free of obvious false negatives caused by detector bugs
- correctly explained by evidence

Do not attempt to make DevLens detect every technology on the Internet.

Focus on correctness of the technologies already supported by the catalog.

---

# PHASE 0 — QUICK RECONNAISSANCE

Inspect:

- technology catalog
- detector implementations
- detector registration
- detector input contracts
- HeaderDetector
- ScriptUrlDetector
- ResourceDetector
- LinkDetector
- CompositeDetector
- DeduplicatingDetector
- ScoringDetector
- evidence extraction
- existing detector tests
- existing fixtures

Do not perform another broad architecture audit.

The purpose is to understand what the current product actually claims to detect.

---

# PHASE 1 — BUILD A DETECTION MATRIX

Create a concrete matrix of supported technologies.

For each representative technology, identify:

- technology ID
- category
- detection signals
- detector responsible
- expected evidence type
- expected minimum evidence

Use the EXISTING catalog.

Do not invent new technologies.

Choose a meaningful representative set across categories, for example:

- frontend framework
- backend/server
- analytics
- CMS
- CDN
- CSS/UI framework
- payment
- infrastructure
- hosting
- JavaScript library

Use technologies that actually exist in the current catalog.

---

# PHASE 2 — REALISTIC HTML FIXTURES

Create or reuse deterministic fixtures representing realistic pages.

Do not rely exclusively on tiny artificial strings such as:

```html
<script src="foo.js"></script>
```
