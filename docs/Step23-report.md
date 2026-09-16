# Step 23 — Web UI for Scan Creation — Report

## 1. Executive Summary

Step 23 completes the first end-to-end DevLens user workflow by adding the
ability to **start a scan from the web UI**. Building on the scan history and
detail pages from Step 22, this step adds:

```text
GET    /scans/new          — scan creation page (NEW, server-rendered HTML)
POST   /api/scans          — existing scan creation endpoint (unchanged)
GET    /scans               — scan history (updated with "New scan" link)
GET    /scans/:id           — scan detail (updated with back link)
```

The user can now: open `/scans/new`, enter a target URL, click "Start scan",
and be navigated to `/scans/{id}` to see the result (including failed scans).

**Key design decisions:**

- Only the form component is a React **client component** (`'use client'`);
  the page remains a server-rendered component for consistent SSR.
- `ScanFormView` is a **pure presentation component** — all state (URL, error,
  submitting) is passed via props, making it testable with `renderToString`
  from `react-dom/server` (no jsdom or `@testing-library/react`).
- The API client (`createScan`) follows the same error handling pattern as the
  Step 22 GET client — `ApiError` with the response body preserved for display,
  but the `Error.message` stays generic ("API error 500").
- Client-side validation provides immediate feedback but the server remains
  authoritative — only basic checks (non-empty, http/https protocol) are
  duplicated, not complex domain validation.
- No new dependencies were added. No UI framework or state-management library.

**Validation:** All 5 checks pass (typecheck, test, lint, build, madge). Test
count increased from 974 → 1006 (+32 new tests).

---

## 2. Existing Web App Audit

### What was already present (from Steps 21–22)

- **Server component pages**: `/scans` (history) and `/scans/[id]` (detail)
  consume the GET API endpoints through the typed `lib/api.ts` client.
- **`ScanViews.tsx`**: 6 pure presentation components
  (`ScanCard`, `ScansHistory`, `ScansError`, `ScanNotFound`,
  `ScanDetailView`, private `EvidenceList`).
- **`lib/types.ts`**: Typed response types mirroring the API contract.
- **`lib/api.ts`**: `fetchScans`, `fetchScanById`, `ApiError` class.
- **CSS Modules**: All styling via `import styles from './module.module.css'`.
- **`@/` path alias**: Works in server components.
- **`vitest.config.ts`**: Custom `jsxTransform` plugin handles `.tsx` files
  for `renderToString`-based component tests.

### What was missing

- No scan creation UI — the POST API existed but was only accessible via
  `curl` or the existing `route.test.ts` tests.
- No client-side form state or navigation on success.
- No link from `/scans` to a creation flow.
- No link from `/scans/[id]` back to `/scans` (only the 404 `ScanNotFound`
  had a back link).

### Conventions adopted

- Server components for pages; only the interactive form is a client component.
- Presentation components are pure (props-in, HTML-out) for testability.
- CSS Modules for all styling.
- `@/` alias for `src/` imports.
- `next/link`'s `Link` for page-to-page navigation.
- `next/navigation`'s `useRouter` for programmatic navigation after POST.
- Server-side error boundary (try/catch) at the page level.

---

## 3. API Client Changes

### `createScan` function — `lib/api.ts`

Added a new function to the existing typed API client, following the same
pattern as `fetchScans` and `fetchScanById`:

```typescript
export async function createScan(url: string): Promise<CreateScanResponse> {
  const body: CreateScanRequest = { url };
  const res = await fetch('/api/scans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await readBody(res);
    throw new ApiError(res.status, errorBody);
  }

  return (await res.json()) as CreateScanResponse;
}
```

### `extractErrorMessage` function — `lib/api.ts`

A new helper that safely extracts a user-facing error message from an
`ApiError`'s body:

```typescript
export function extractErrorMessage(body: ErrorResponse | string): string;
```

- For 400 responses: returns the server's validation message (e.g.
  "The url must be a valid absolute URL.") — this is safe to display.
- For 500 responses: returns the server's generic message
  ("An internal error occurred.") — already sanitized by the handler.
- For plain string bodies: returns "An error occurred. Please try again."
- For malformed objects: returns the generic fallback.

### Types added — `lib/types.ts`

| Type                 | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `CreateScanRequest`  | Request body: `{ url: string }`                                       |
| `CreateScanResponse` | Alias for `ScanDetailResponse` (POST returns same shape as GET by ID) |

The POST response shape is identical to `GET /api/scans/:id`'s 200 response
— the API handler reuses `resultToResponse` for both. This ensures
consistency and avoids a second response contract.

### Error handling consistency

| Scenario              | API Status | `createScan` behavior                   |
| --------------------- | ---------- | --------------------------------------- |
| Valid URL, scan runs  | 200        | Returns `CreateScanResponse`            |
| Server URL validation | 400        | Throws `ApiError` (message from server) |
| Server crash          | 500        | Throws `ApiError` (generic message)     |

---

## 4. Form Components

### Architecture

```
app/scans/new/page.tsx          (server component — page shell)
  └── components/ScanForm.tsx      (client component — state + API calls)
        └── components/ScanFormView.tsx  (pure presentation — tested with renderToString)
```

### `ScanFormView` — pure presentation component

File: `apps/web/src/components/ScanFormView.tsx` (no `'use client'`)

Receives all state as props:

```typescript
interface ScanFormViewProps {
  url: string;
  error: string | null;
  isSubmitting: boolean;
  onUrlChange: (url: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}
```

Renders:

- A `<form>` element with `data-testid="scan-form"`
- A labeled URL `<input type="url">` with placeholder, autoComplete, aria-invalid
- An error `<p role="alert">` (only when `error` is non-null)
- A submit `<button>` that shows "Starting scan…" and is disabled while
  `isSubmitting` is true

### `ScanForm` — client component

File: `apps/web/src/components/ScanForm.tsx` (has `'use client'`)

Manages three pieces of state:

1. `url` — the input value
2. `isSubmitting` — boolean for the loading/submitting state
3. `error` — `string | null` for error messages

The `handleSubmit` function:

1. Validates URL client-side via `validateUrl()` — if invalid, sets `error`
   and returns (no API call).
2. Sets `isSubmitting = true`, clears any previous error.
3. Calls `createScan(url)` — the typed API client.
4. On 200: calls `router.push('/scans/{scan.id}')` — navigates to detail.
   This works for both `completed` and `failed` scans (both return 200).
5. On `ApiError`: calls `extractErrorMessage(e.body)` and sets `error`.
6. On unexpected error: sets a generic error message.
7. In `finally`: sets `isSubmitting = false`.

### `ScanForm.module.css`

Styles for form layout, input field, error text, and submit button
(including hover/disabled states).

---

## 5. Scan Creation Page (`/scans/new`)

File: `apps/web/src/app/scans/new/page.tsx`

A **server component** (no `'use client'`) that renders the page shell:

```tsx
export default function NewScanPage(): React.ReactElement {
  return (
    <main className={styles.main}>
      <h1>New Scan</h1>
      <p>Enter a target URL to start scanning.</p>
      <Link href="/scans" className={styles.backLink}>
        ← Back to scan history
      </Link>
      <ScanForm /> {/* ← the only client component */}
    </main>
  );
}
```

The page includes:

- A heading and subtitle
- A back link to `/scans` (server-rendered, no JS needed)
- The `ScanForm` client component (handles all interaction)

---

## 6. Navigation

All navigation links were added to connect the three pages:

| From                     | To            | Mechanism                |
| ------------------------ | ------------- | ------------------------ |
| `/scans`                 | `/scans/new`  | `Link` (server-rendered) |
| `/scans/new`             | `/scans`      | `Link` (server-rendered) |
| `/scans`                 | `/scans/{id}` | `Link` in `ScanCard`     |
| `/scans/{id}`            | `/scans`      | `Link` + `ScanNotFound`  |
| `/scans/new` (on submit) | `/scans/{id}` | `router.push()` (client) |

- `/scans` now has a "+ New scan" link in the header.
- `/scans/[id]` now has a "← Back to scan history" link in all states
  (found, not-found, error).
- `/scans/new` has a back link to `/scans`.
- After successful POST, `ScanForm` calls `router.push('/scans/{scan.id}')`
  for programmatic navigation (the scan ID comes from the API response).

---

## 7. Client-Side Validation

File: `apps/web/src/lib/validation.ts`

A pure function:

```typescript
export function validateUrl(url: string): string | null;
```

Returns `null` if valid, or a human-readable error message if invalid.

**Checks performed:**

| Input                            | Result                                     |
| -------------------------------- | ------------------------------------------ |
| `''` or `'   '`                  | "Please enter a URL."                      |
| `'not a url'`                    | "Please enter a valid URL..."              |
| `'example.com'`                  | "Please enter a valid URL..."              |
| `'ftp://example.com'`            | "URL must use the http or https protocol." |
| `'javascript:alert(1)'`          | "URL must use the http or https protocol." |
| `'file:///etc/passwd'`           | "URL must use the http or https protocol." |
| `'https://example.com'`          | `null` (valid)                             |
| `'https://example.com/path?q=1'` | `null` (valid)                             |

**What is NOT duplicated:**

- Server-side SSRF protection (localhost, private IP ranges, link-local,
  redirect chains) — enforced by `HttpCrawler.crawl()` with
  `isBlockedHostname`.
- Domain validation, DNS resolution, TLS checks — server-side only.
- The server validates the URL independently and returns 400 with a
  structured error if client-side validation is bypassed.

---

## 8. Important UI States

### Form states

1. **Idle** — empty URL input, "Start scan" button enabled, no error.
2. **Typing** — URL input reflects user input.
3. **Client validation error** — error message shown, button still enabled,
   URL input has `aria-invalid="true"`.
4. **Submitting** — button shows "Starting scan…", is disabled, URL input
   is disabled. No new errors can be entered.
5. **API error (400)** — server validation error message shown (e.g. "The url
   must be a valid absolute URL."), button re-enabled.
6. **API error (500)** — generic error message shown, button re-enabled.
7. **Success** — navigates to `/scans/{scan.id}` (client-side, via `router.push`).

### Scan result states after creation

| API Response                | Behavior                                                   |
| --------------------------- | ---------------------------------------------------------- |
| 200, `status: "completed"`  | Navigate to detail — shows full snapshot + detections      |
| 200, `status: "failed"`     | Navigate to detail — shows error code/message, no snapshot |
| 400 (server URL validation) | Error message displayed in the form                        |
| 500 (infrastructure)        | Generic error message displayed in the form                |

The critical distinction: a **failed scan** returns 200 from the API and
navigates to the detail page. Only HTTP errors (400, 500) keep the user on
the form page with an error message.

---

## 9. Tests Added

### API client tests — `apps/web/src/lib/api.test.ts` (10 new tests)

**createScan (6 tests):**

- ✅ Sends POST with correct body `{ url: "..." }` and `Content-Type: application/json`
- ✅ Returns the scan response on 200 (with scan ID, status, snapshot, detections)
- ✅ Returns a failed scan as a valid 200 result (navigation happens, error shown on detail page)
- ✅ Throws ApiError on 400 (server validation error)
- ✅ Throws ApiError on 500 (infrastructure error)
- ✅ Does not leak raw error body in ApiError.message on 500

**extractErrorMessage (4 tests):**

- ✅ Extracts the message from a structured error response (400 case)
- ✅ Returns the generic 500 message from the server
- ✅ Returns a generic fallback for a plain string body
- ✅ Returns a generic fallback when message is empty

**Total: 21 tests in `api.test.ts` (11 from Step 22 + 10 from Step 23).**

### Validation tests — `apps/web/src/lib/validation.test.ts` (10 tests)

- ✅ Returns null for a valid https URL
- ✅ Returns null for a valid http URL
- ✅ Returns null for a URL with path and query string
- ✅ Returns an error for an empty string
- ✅ Returns an error for a whitespace-only string
- ✅ Returns an error for a malformed URL
- ✅ Returns an error for a URL without protocol
- ✅ Returns an error for ftp protocol
- ✅ Returns an error for javascript: protocol
- ✅ Returns an error for file: protocol

### Form presentation tests — `apps/web/src/components/ScanFormView.test.tsx` (12 tests)

Uses `renderToString` from `react-dom/server` with `vi.mock('next/link')`
(note: `ScanFormView` does not use `Link`, but the mock is included for
consistency with the Step 22 pattern).

- ✅ Renders a form with URL input and submit button
- ✅ Renders "Target URL" label for the input
- ✅ Accepts URL — input reflects the provided url prop
- ✅ Renders the placeholder text
- ✅ Renders submitting state — button shows "Starting scan…" and is disabled
- ✅ Does not show "Starting scan…" when not submitting
- ✅ Renders an API error message when error prop is set
- ✅ Renders a server validation error message
- ✅ Sets `aria-invalid="true"` when there is an error
- ✅ Does not set `aria-invalid` when there is no error
- ✅ Does not render an error element when error is null
- ✅ Renders the form with a data-testid for testing

---

## 10. Architecture & Dependency Flow

```
[User] → /scans/new page.tsx (server)
                ↓
          ScanForm.tsx (client: 'use client')
                ↓ calls
          createScan() in lib/api.ts
                ↓ fetch POST /api/scans
          [API Route: apps/web/src/app/api/scans/route.ts]
                ↓ delegates to
          handleCreateScan() in handler.ts (pure)
                ↓ delegates to
          executeScan() in @devlens/application
                ↓ calls
          HttpCrawler.crawl() + Detector.detect() + ScanResultRepository.save()
```

**Browser boundary:** The browser only knows about:

1. `lib/api.ts` — typed `fetch` wrappers (`fetchScans`, `fetchScanById`, `createScan`)
2. `lib/types.ts` — response type definitions
3. `lib/validation.ts` — client-side URL validation
4. Presentation components (`ScanViews.tsx`, `ScanFormView.tsx`)
5. The form client component (`ScanForm.tsx`)

The browser does **NOT** import any of `@devlens/*`, `@devlens/database`,
`@devlens/application`, or `@devlens/core` packages.

---

## 11. Server/Client Boundary

### Server components (SSR, no JS bundle)

| File                      | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `app/scans/new/page.tsx`  | Page shell, back link, renders `ScanForm` |
| `app/scans/page.tsx`      | History page, "New scan" link             |
| `app/scans/[id]/page.tsx` | Detail page, back link                    |

### Client component (bundles JS, runs in browser)

| File                      | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `components/ScanForm.tsx` | Form state, validation, API call, navigation |

### Pure presentation components (no JS bundle boundary)

| File                          | Purpose                                     |
| ----------------------------- | ------------------------------------------- |
| `components/ScanFormView.tsx` | Stateless form UI (props: url, error, etc.) |
| `components/ScanViews.tsx`    | Scan history and detail presentation        |

### Why "the smallest necessary component" is a client component

Only `ScanForm` needs `'use client'` because it uses:

- `useState` — for URL input, error, and submitting state
- `useRouter` — for `router.push()` navigation after successful creation
- `handleSubmit` — async function that calls the API

`ScanFormView` is pure (no hooks) and could theoretically be a server
component, but it's imported by `ScanForm` (a client component), so it's
bundled as part of the client component anyway. Keeping it separate enables
`renderToString` testing without mocking hooks.

---

## 12. Security / Exposure Audit

- **No domain/repo access from UI** — the browser layer never imports
  `@devlens/application`, `@devlens/database`, or `@devlens/core`. Only
  `lib/api.ts` (typed `fetch` wrappers) and `lib/types.ts` are used.
- **Error message containment** — `ApiError.message` is always
  `"API error {status}"`. The server's error body is stored in `ApiError.body`
  and extracted via `extractErrorMessage()` for display, but only the
  user-safe message is shown. The 500 handler on the server already returns
  a generic message (`"An internal error occurred."`) — no DB internals leak.
- **URL encoding handled server-side** — the browser sends the URL as a JSON
  string body (`{ url: "..." }`), not as a URL path parameter. The server
  parses and validates it.
- **XSS prevention** — React's JSX escaping neutralizes any malicious content
  in error messages, URLs, or scan data rendered in the detail page.
- **No new SSRF surface** — the UI doesn't trigger any crawling; it only
  calls the existing POST API which has its own SSRF protection
  (`isBlockedHostname` in `HttpCrawler`).
- **No new dependencies** — only existing packages (React 19, Next.js 15,
  vitest) are used.
- **Content-Type header** — POST requests include
  `Content-Type: application/json` to prevent MIME-type confusion.

---

## 13. Changes Made

### New files

| File                                            | Purpose                                     |
| ----------------------------------------------- | ------------------------------------------- |
| `apps/web/src/lib/validation.ts`                | Client-side URL validation helper           |
| `apps/web/src/lib/validation.test.ts`           | 10 validation tests                         |
| `apps/web/src/components/ScanFormView.tsx`      | Pure form presentation component            |
| `apps/web/src/components/ScanFormView.test.tsx` | 12 form presentation tests (renderToString) |
| `apps/web/src/components/ScanForm.tsx`          | Client component (state + API + navigation) |
| `apps/web/src/components/ScanForm.module.css`   | Form styles                                 |
| `apps/web/src/app/scans/new/page.tsx`           | `/scans/new` page (server component)        |
| `apps/web/src/app/scans/new/page.module.css`    | Page styles                                 |
| `docs/Step23-report.md`                         | This report                                 |

### Modified files

| File                                          | Change                                                    |
| --------------------------------------------- | --------------------------------------------------------- |
| `apps/web/src/lib/types.ts`                   | Added `CreateScanRequest` and `CreateScanResponse` types  |
| `apps/web/src/lib/api.ts`                     | Added `createScan()` and `extractErrorMessage()`          |
| `apps/web/src/lib/api.test.ts`                | Added 10 tests for `createScan` and `extractErrorMessage` |
| `apps/web/src/app/scans/page.tsx`             | Added "New scan" link in header                           |
| `apps/web/src/app/scans/page.module.css`      | Added `.header` and `.newScanLink` styles                 |
| `apps/web/src/app/scans/[id]/page.tsx`        | Added "Back to scan history" link in all states           |
| `apps/web/src/app/scans/[id]/page.module.css` | Added `.detailHeader` and `.backLink` styles              |

### Unchanged files (verified untouched)

- `apps/web/src/app/api/scans/handler.ts` — POST handler
- `apps/web/src/app/api/scans/route.ts` — POST route
- `apps/web/src/app/page.tsx` — homepage
- `apps/web/src/app/layout.tsx` — root layout
- `apps/web/src/app/api/scans/[id]/route.ts` — GET by ID route
- `apps/web/src/components/ScanViews.tsx` — Step 22 presentation components
- All `@devlens/*` packages — no changes
- `vitest.config.ts` — unchanged from Step 22

---

## 14. Deferred Features

| Feature                 | Reason for deferral                                          |
| ----------------------- | ------------------------------------------------------------ |
| Form client-state store | Not needed; local `useState` is sufficient for a single form |
| Form auto-focus         | Minor UX enhancement; not required for MVP                   |
| URL prefill from query  | e.g. `/scans/new?url=...` — could be a future convenience    |
| Scan progress indicator | Spec forbids polling/live refresh                            |
| Form reset after submit | Navigation replaces the page; form is fresh on return        |
| Keyboard shortcuts      | Not requested                                                |
| Dark mode               | Not requested                                                |

---

## 15. Validation Results

All five validation checks pass:

| Check                 | Command                                              | Result                            |
| --------------------- | ---------------------------------------------------- | --------------------------------- |
| TypeScript type check | `pnpm typecheck`                                     | ✅ Pass                           |
| Tests                 | `pnpm test`                                          | ✅ Pass (1006 passed, 18 skipped) |
| Lint + format         | `pnpm lint`                                          | ✅ Pass                           |
| Build                 | `pnpm build`                                         | ✅ Pass                           |
| Circular deps         | `npx madge --circular --extensions ts packages apps` | ✅ Pass (0 circular, 160 files)   |

### Build output

Next.js build produces all routes:

```text
Route (app)
├── ○ /                                           228 B
├── ○ /_not-found                                 990 B
├── ƒ /api/scans                                  131 B
├── ƒ /api/scans/[id]                             131 B
├── ƒ /scans                                      675 B
├── ƒ /scans/[id]                                 687 B
└── ○ /scans/new                                 1.36 kB
```

The `/scans/new` page is statically prerendered (`○`) — it contains no data
fetching and does not need server-side rendering at request time. The form
component (`ScanForm.tsx`) is client-side only.

### Baseline comparison

```text
Step 20 → Step 21 → Step 22 → Step 23 test counts:
  916 → 943 → 974 → 1006 passed (+32 new tests in Step 23)
  18 skipped (unchanged — PostgreSQL integration tests without DATABASE_URL)
```

### Implementation notes

1. **`ScanForm` client component**: The only `'use client'` component in the
   scan creation flow. It manages three `useState` values (URL, isSubmitting,
   error) and uses `useRouter` from `next/navigation` for post-creation
   navigation. The page (`page.tsx`) is a server component that simply renders
   the `ScanForm` as a child — Next.js handles the module boundary.

2. **`ScanFormView` separation**: By extracting the pure UI into
   `ScanFormView`, the presentation logic is testable with `renderToString`
   without needing jsdom or hook testing. All interactive state is passed
   via props.

3. **`extractErrorMessage` safety**: The function checks `typeof body === 'object'`
   and `'error' in body` before accessing `body.error.message`. This handles
   all three cases: structured error responses, plain text bodies, and
   unexpected shapes.

4. **Client validation is advisory**: `validateUrl` mirrors only the basic
   server checks (non-empty, parseable, http/https). It does NOT replicate
   SSRF protection, domain validation, or any domain-level rule. The server
   remains authoritative — any client-side bypass results in a 400 from the
   server, which is displayed via the same error path.

5. **`router.push` for navigation**: Using `useRouter` from `next/navigation`
   (instead of a `Link` or `window.location`) enables client-side navigation
   after form submission without a full page reload. This is the only place
   in the app that uses imperative routing.
