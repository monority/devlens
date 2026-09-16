Goal: complete the first end-to-end DevLens user workflow by allowing a user to start a scan from the web application.

Current product flow:

POST /api/scans
GET /api/scans
GET /api/scans/:id
/scans
/scans/[id]

Step 23 must connect the existing POST API to a minimal user-facing scan creation interface.

Do NOT redesign the application.
Do NOT introduce authentication, accounts, jobs, polling infrastructure, WebSockets, or a new state-management library.

1. Inspect the existing web application first.

Reuse:

- existing styling conventions
- existing API client
- existing response types
- existing error handling
- existing ScanViews components where appropriate

Do not duplicate API contracts.

2. Create a scan creation UI.

Add a clear entry point, preferably:

/scans/new

The page should contain:

- URL input
- submit action
- validation state
- submitting/loading state
- API error state

The interface should remain deliberately minimal.

Example conceptual flow:

New Scan
─────────
Target URL
[ https://example.com ]

[ Start scan ]

3. Reuse the existing POST /api/scans contract.

Create or extend the typed API client with something equivalent to:

createScan(url)

The client must:

- send the correct request body
- use the existing endpoint
- parse the existing response contract
- expose structured API errors consistently with the existing GET client

Do not modify the backend contract unless absolutely necessary.

4. Validate the URL on the client for UX.

Client-side validation should provide immediate feedback for obviously invalid input.

However:

- the server remains authoritative
- do not duplicate complex URL/domain validation rules
- do not weaken the existing API validation

The UI must correctly handle server-side validation errors as well.

5. Handle successful creation.

After a successful POST:

- obtain the returned scan ID
- navigate to `/scans/[id]`

Do not add polling yet.

Do not assume the scan is completed unless the API response says so.

The detail page must correctly render whatever state the POST response returns.

6. Handle failed scans correctly.

Important distinction:

- HTTP/API failure → display an actionable error state
- successfully created scan whose status is `failed` → navigate to its detail page and let the existing detail UI display the failed scan

Do not treat domain scan failure as an HTTP request failure.

7. Improve navigation minimally.

Provide a clear way to reach:

/scans/new

from the existing scans experience.

Also provide:

/scans → /scans/[id]
/scans/[id] → /scans
/scans → /scans/new

Reuse existing navigation conventions.

8. Add tests.

API client:

- successful POST
- request body
- API error
- malformed/unexpected response if the existing client pattern supports this

UI:

- renders form
- accepts URL
- client validation
- submitting state
- successful navigation
- API error
- server validation error

Do not test React/framework internals.

9. Keep architecture simple.

Preferred structure:

page
↓
form/presentation component
↓
typed API client
↓
POST /api/scans

Do NOT:

- call the database from UI code
- import application/domain packages into the browser
- create a second scan execution path
- duplicate scan orchestration
- introduce React Query/SWR/Zustand/etc.
- introduce a global store

10. Consider server/client boundaries carefully.

The scan form will need client-side interaction.

Keep the page and data-fetching architecture consistent with Step 22.

Only the smallest necessary component should become a client component.

11. Documentation.

Create:

docs/Step23-report.md

Document:

- new route
- API client changes
- UI components
- navigation
- validation behavior
- tests
- validation results

12. Validation.

Run:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps

Success criteria:

- user can open `/scans/new`
- user can enter a target URL
- submitting creates a scan through the existing POST API
- successful creation navigates to the scan detail page
- API errors are displayed without leaking internals
- server validation remains authoritative
- failed scans remain distinguishable from HTTP failures
- existing `/scans` and `/scans/[id]` functionality remains intact
- no unnecessary dependencies
- no new architecture
- all validation checks pass

After completion, report:

- files created
- files modified
- tests added
- validation results
- important implementation decisions
