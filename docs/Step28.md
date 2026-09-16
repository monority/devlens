Goal: make individual DevLens scan results stable, shareable, and useful as standalone technical reports.

Step 27 completed scan history search/filtering.

Step 28 focuses on the individual scan report at:

/scans/[id]

The goal is NOT authentication or public hosting. The existing scan detail URL should simply behave like a clean, self-contained report.

Do NOT modify detectors, crawler, scoring, persistence, or scan execution.

1. Inspect the existing scan detail page.

Understand the current:

- metadata
- target URL
- hostname
- status
- timestamps
- detections
- evidence
- failure state
- navigation
- comparison link

Reuse existing components.

2. Establish stable report metadata.

The scan detail page should expose useful document metadata where Next.js already supports it.

At minimum, derive:

- page title from the scan target
- description reflecting that this is a DevLens technology scan

For example conceptually:

DevLens — example.com

Do not include raw internal errors in metadata.

If the scan cannot be loaded, use the existing generic not-found/error metadata.

3. Make the report URL-safe to share.

Verify that:

/scans/[id]

works correctly when opened directly rather than navigated from `/scans`.

Verify:

- valid ID
- unknown ID
- failed scan
- completed scan
- pending/running scan

No reliance on client navigation state.

4. Add a compact report header.

The existing report should clearly expose:

- target
- scan ID
- status
- creation/start/completion information
- detection count where meaningful

The scan ID should be available as technical metadata, but should not dominate the visual hierarchy.

Do not create fake analytics.

5. Add "copy report link".

Provide a small action allowing the user to copy the current scan URL.

Requirements:

- use the browser Clipboard API
- provide accessible feedback after successful copy
- provide a graceful fallback/error state if clipboard access fails
- do not expose the URL through an alert
- do not add a clipboard dependency

Keep this action isolated in a tiny client component.

6. Add a stable "report URL" representation.

Provide an accessible way to identify/share the report URL.

Do not render an enormous URL field.

A simple:

Copy report link

action is sufficient.

7. Preserve server rendering.

The scan report should remain server-rendered.

Only the copy interaction should require a client component.

Preferred structure:

page.tsx
↓
ScanDetailView
├── ScanSummary
├── CopyReportLink
├── DetectionList
└── ...

Do not turn the entire detail page into a client component.

8. Handle lifecycle states.

Do not regress Step 24.

Pending/running:

- report remains shareable
- current lifecycle state is visible
- polling continues as before

Completed:

- full report

Failed:

- failure report

Unknown:

- existing 404 state

Do not introduce a second polling mechanism.

9. Preserve comparison and history navigation.

The report must retain access to:

- back to scans
- compare with another scan
- new scan

Do not create duplicate navigation systems.

10. Accessibility.

Copy action must:

- be a real `<button>`
- have an accessible name
- expose success/error feedback to assistive technology
- not depend only on color

If using temporary "Copied" feedback, ensure it is understandable without visual color changes.

11. Tests.

Add tests for:

Metadata:

- completed scan title
- target-derived title
- safe metadata for failed scan
- unknown/not-found behavior where applicable

Copy component:

- renders correctly
- clipboard success
- clipboard failure
- accessible success feedback

Report:

- scan ID visible
- target visible
- status visible
- detection count
- existing navigation remains present

Regression:

- pending
- running
- completed
- failed

Do not test browser/Next.js internals unnecessarily.

12. Security / information boundaries.

The report may expose only information already present in the existing API response.

Do NOT add:

- server environment information
- database IDs beyond the existing scan ID
- request headers unrelated to evidence
- secrets
- crawler internals
- stack traces
- internal filesystem paths

13. Do NOT add:

- authentication
- public/private permissions
- user accounts
- access tokens
- social sharing integrations
- analytics
- QR codes
- PDF export
- screenshots
- server-side rendering changes unrelated to metadata
- new API endpoints
- database changes
- third-party dependencies

14. Documentation.

Create:

docs/Step28-report.md

Document:

- report URL behavior
- metadata
- copy-link behavior
- lifecycle behavior
- information exposed
- accessibility
- tests
- validation results

15. Validation.

Run:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps

Success criteria:

- `/scans/[id]` works as a standalone shareable report
- useful title/metadata is generated
- target and scan ID are clearly identifiable
- copy-link action works without dependencies
- clipboard failures are handled gracefully
- server rendering remains the default
- lifecycle/polling behavior is unchanged
- existing navigation remains intact
- no internal information leaks
- no backend changes
- no unnecessary dependencies
- all validation checks pass

After completion, report:

- files created
- files modified
- metadata behavior
- copy-link implementation
- lifecycle compatibility
- tests added
- validation results
- important implementation decisions
