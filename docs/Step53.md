# DevLens — Step 53 — Technology Detail: Real Scan Usage

## Context

Steps 44–52 are complete.

Current validated state:

- `/` — real Home Dashboard
- `/scans/new` — scan creation
- `/scans` — scan history
- `/scans/{id}` — rich scan detail
- `/scans/compare` — complete comparison
- `/technologies` — technology catalog
- `/technologies/{id}` — technology detail
- Global application navigation now exists across the application

Latest validation:

- 1613 Vitest tests passed
- 18 skipped
- TypeScript passes
- ESLint passes
- Prettier passes
- Next build passes
- madge reports no circular dependency

## Objective

Make `/technologies/{id}` materially useful by connecting a technology to real scan data already available in the application.

The current technology detail page is largely catalog metadata.

The goal is NOT to redesign the technology catalog or build analytics.

The goal is:

> Given a known technology, show which existing scans detected it, using the application's real persisted scan/detection data.

This should create a real relationship:

Technology
→ detections
→ scans
→ scan details

---

# Step 0 — Inspect the existing architecture

Before editing, inspect:

- `apps/web/src/app/technologies/[id]/page.tsx`
- current technology detail component(s)
- `getTechnologies()`
- `isKnownTechnology()`
- technology catalog types
- existing scan fetching APIs/helpers
- `fetchScans()`
- scan detail fetching if available
- existing detection response types
- existing `ScanCard`
- existing `ScanOverview`
- existing database/API boundaries

Determine the cheapest existing source of truth for answering:

> "Which scans contain a detection for technology X?"

Do NOT invent a new data source.

Do NOT duplicate database logic inside the page.

Prefer reusing existing API/data-access functions.

---

# Required behavior

## 1. Preserve the existing technology identity

The page must continue to show:

- technology name
- technology ID where appropriate
- category
- description

Do not fabricate additional metadata.

---

## 2. Real detected scans section

For a known technology, add a section such as:

"Detected in scans"

The section must be derived exclusively from real scan/detection data.

For each matching scan, show useful existing scan information, preferably through reusable existing components where appropriate:

- target
- hostname
- scan status
- date/time
- link to `/scans/{id}`

Do not duplicate the scan detail page.

The scan entry should act as a navigation point to the full scan.

---

## 3. Matching semantics

A scan should appear only when that technology is actually present in its detections.

Use the canonical technology identity already established by the project.

Do NOT:

- match on display name
- perform fuzzy matching
- infer technologies from URLs
- infer technologies from categories
- create fake detections
- change detector behavior

Use the existing technology ID / detection identity semantics.

---

## 4. Completed vs non-completed scans

Determine from the existing domain/API semantics whether only completed scans should be considered.

Follow the application's existing meaning of a valid detection.

Do not invent a new status policy.

Document the chosen behavior in the implementation/spec if needed.

---

## 5. Empty state

If the technology is valid but no scans contain it, show an explicit factual empty state.

Example concept:

"No completed scans have detected this technology yet."

Use wording consistent with the actual status semantics discovered during implementation.

Do not imply that the technology is absent from the web in general.

It only means no matching scan exists in this application's available data.

---

## 6. Unknown technology

Preserve the existing unknown-technology behavior.

If `/technologies/{id}` does not correspond to a known catalog technology:

- keep the existing not-found behavior
- do not query arbitrary scan data
- do not create a fabricated technology page

---

# Data loading architecture

Prefer server-side loading.

The technology detail page should remain a server component unless the existing architecture genuinely requires otherwise.

If multiple independent data sources are required, use `Promise.all`.

Important:

Do not create an N+1 network/database pattern unnecessarily.

If the existing API can provide all scans and their detection information efficiently, use that.

If the current API only provides scan summaries and individual scan details, inspect whether there is already a better server-side query/helper.

Choose the smallest architectural change that provides correct data.

Do NOT prematurely introduce:

- a new database table
- a new caching layer
- a global state store
- a new API framework
- GraphQL
- background jobs
- analytics infrastructure

---

# Performance

The technology detail page should remain reasonable if the scan history becomes large.

Do not blindly fetch every scan detail one by one.

If the existing architecture does not expose a suitable query for "scans containing technology X", determine whether a small read-side helper/API addition is justified.

If such an addition is required:

- keep it read-only
- keep it deterministic
- reuse existing persistence/query abstractions
- do not modify scan execution
- do not modify detector semantics
- do not modify stored detection format

Explain the decision in the final report.

---

# Presentation

Match the existing DevLens visual language.

Keep the page restrained and information-dense.

Recommended hierarchy:

```text
Technology
├── identity
├── description
└── Detected in scans
    ├── matching scan
    ├── matching scan
    └── ...