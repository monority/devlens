Goal: turn the new scan history APIs into the first usable DevLens product interface.

Step 21 made scans queryable. Step 22 must expose that functionality through the web application with a small, coherent UI.

Do NOT start another audit/hardening phase.
Do NOT redesign the whole application.
Do NOT introduce a UI framework or component library unless one already exists in the project.

1. First inspect the existing apps/web structure and current UI conventions.

Identify:

- existing root/page layout
- existing styling approach
- existing components
- existing POST scan flow, if any
- existing loading/error patterns
- current API client conventions

Reuse existing conventions wherever possible.

2. Create a scan history page.

Preferred route:

/scans

The page should consume:

GET /api/scans

Display, at minimum:

- scan target URL
- scan status
- number of detections
- creation/start/completion information if already available in ScanResult
- a clear link/action to inspect the scan

Use the existing API response contract from Step 21.
Do not duplicate domain mapping logic in the UI.

3. Create a scan detail page.

Preferred route:

/scans/[id]

Consume:

GET /api/scans/:id

Display:

- target URL
- scan status
- relevant timestamps
- detected technologies
- confidence/score
- evidence
- detector/evidence information already exposed by the API

The detail page should make the existing explainability information useful to a human.

Do not invent new detection semantics.

4. Handle the important states explicitly.

History page:

- loading
- empty
- successful list
- API failure

Detail page:

- loading
- successful result
- 404 / unknown scan
- API failure

A failed scan returned by the API must still be displayed as a real scan with its failure status/error information where the existing response contract exposes it.

5. Add navigation between history and detail.

Minimum:

- `/scans` → `/scans/[id]`
- detail → back to `/scans`

If the existing application already has navigation/header conventions, integrate with them rather than creating a second navigation system.

6. Add a minimal scan-result presentation.

Avoid a generic dashboard full of cards.

The primary hierarchy should be:

Scan
├── target
├── status
├── timeline / metadata
└── detections
├── technology
├── confidence / score
└── evidence

Evidence should remain readable and structured.

7. Add tests.

Test the actual UI behavior using the project's existing test stack.

At minimum cover:

History:

- renders scans
- empty state
- API failure
- navigation/link to detail

Detail:

- renders scan data
- renders detections/evidence
- handles 404
- handles API failure
- handles failed scan

Do not add tests for framework internals.

8. Keep API and domain boundaries clean.

UI components must NOT:

- access the database
- import domain repositories
- reproduce detector logic
- calculate detection scores
- reconstruct ScanResult objects

The browser consumes the HTTP API only.

9. Keep the scope deliberately small.

Do NOT implement yet:

- pagination
- search
- filtering
- sorting controls
- authentication
- user accounts
- live polling
- WebSockets
- background refresh
- charts
- analytics
- scan deletion
- bulk actions
- settings
- notifications

Those are later product steps.

10. Documentation.

Create:

docs/Step22-report.md

Document:

- pages/routes added
- components added
- API usage
- important UI states
- tests added
- validation results

11. Validation.

Run:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps

Do not modify unrelated packages simply to make Step 22 appear larger.

Success criteria:

- `/scans` provides a usable scan history
- `/scans/[id]` provides a usable scan inspection view
- both consume only the HTTP API
- failed scans remain visible
- unknown scans produce a proper not-found state
- detection evidence is understandable
- existing POST `/api/scans` behavior remains unchanged
- all tests pass
- no circular dependencies
- no unnecessary dependencies
- no new architecture introduced without need

After completing the implementation, report:

- files created
- files modified
- tests added
- validation results
- any important implementation decisions
