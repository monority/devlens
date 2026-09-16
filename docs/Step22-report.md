# Step 22 — Web UI for Scan History & Details — Report

## 1. Executive Summary

Step 22 adds the **first web UI** to DevLens, turning the queryable scan
history APIs (from Step 21) into a usable product interface.

```text
GET    /scans           — scan history page (list)
GET    /scans/:id       — scan detail page (single scan inspection)
GET    /api/scans       — list endpoint (existing, unchanged)
GET    /api/scans/:id   — get-by-id endpoint (existing, unchanged)
POST   /api/scans       — create and execute a scan (existing, unchanged)
```

Two new **Next.js server components** consume the existing HTTP API endpoints
through a typed client (`lib/api.ts`). Data fetching and error handling happen
at the server level; the client receives fully rendered HTML with no layout
shift for data. Presentation components (`ScanViews.tsx`) are pure functions
tested via `renderToString` from `react-dom/server` — no jsdom or
`@testing-library/react` required.

**Key design decisions:**

- No UI framework or component library was introduced. Plain React + CSS
  Modules, consistent with the existing `page.module.css` convention.
- The UI layer depends **only** on the HTTP API — components never access the
  database, import domain repositories, or reconstruct `ScanResult` objects.
- `GET /api/scans` and `GET /api/scans/:id` responses are treated as opaque
  JSON contracts; `lib/types.ts` mirrors the response shapes without coupling
  to any handler's internal type names.
- No new dependencies were added (React, react-dom, and vitest were already
  present). The vitest config's esbuild was configured to handle `.tsx` files.

**Validation:** All 5 checks pass (typecheck, test, lint, build, madge). Test
count increased from 943 → 974 (+31 new tests).

---

## 2. Existing Web App Audit

### What was already present

- **Next.js 15.5.24** app at `apps/web/`, using the App Router with TypeScript
  strict mode (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noUnusedLocals`, `noUnusedParameters`).
- **Single homepage** (`app/page.tsx`) with `page.module.css` (flexbox column,
  centered). `layout.tsx` wraps children in `<html><body>`.
- **POST scan flow** (`app/api/scans/route.ts`) was already implemented and
  tested from Step 21 — the POST endpoint is unchanged.
- **`@/` path alias** works automatically in Next.js server components.
- **CSS Modules** used via `import styles from './module.module.css'`.
- **Vitest v4.1.11** as the test runner, `environment: 'node'`, root config at
  `vitest.config.ts`. No jsdom — CSS module classes are transformed to objects
  by Vite's built-in processor.

### What was missing

- No pages beyond the homepage.
- No API client — server components called the API handlers directly (the
  POST flow). For GET requests, the API is called server-side via a typed
  client module.
- No presentation components or styling beyond the homepage.
- No `.tsx` test files (all existing tests are `.ts`).

### Conventions adopted

- Server components handle data fetching and error catching; presentation
  components receive data as props (pure functions).
- CSS Modules for all styling (matching `page.module.css` convention).
- `@/` alias for imports from `src/` (e.g., `@/lib/api`, `@/components/ScanViews`).
- `.js` extensions in relative type imports (matching existing convention in
  `apps/web/src/app/api/scans/handler.ts`).

---

## 3. Typed API Client

### `lib/types.ts` — API contract types

A new file defining TypeScript types that mirror the JSON response shapes
returned by the API endpoints. These types are defined independently of the
handler's internal types — the UI depends on the _contract_, not on handler
implementation details.

```text
ScanResponse      — the scan object in every response
ScanSummary       — alias for ScanResponse (used in list items)
ScansListResponse — GET /api/scans 200 body: { scans: ScanSummary[] }
SnapshotResponse  — the snapshot object (or null)
DetectionResponse — a detection entry with technology, confidence, evidence
EvidenceResponse  — discriminated union of 8 evidence types
ScanDetailResponse — GET /api/scans/:id 200 body
ErrorResponse     — 404/500 error body shape
```

The `EvidenceResponse` type is a discriminated union matching all 8 evidence
types returned by the API (`http_header`, `meta_tag`, `script_url`,
`script_content`, `html`, `javascript_global`, `resource`, `link`).

### `lib/api.ts` — API client

A thin typed wrapper around `fetch` that is the **only** place the UI calls the
API:

```typescript
export async function fetchScans(): Promise<ScansListResponse>
export async function fetchScanById(id: string): Promise<ScanDetailResponse | null>
export class ApiError extends Error  // thrown on 500, etc.
```

Key behaviors:

- `fetchScanById` returns `null` for **404** (not-found is a valid result, not
  an error). This lets the detail page distinguish "scan doesn't exist" from
  "server error."
- `fetchScanById` **throws `ApiError`** for 500 (or any non-200/non-404).
  Both `fetchScans` and `fetchScanById` throw `ApiError` on non-OK responses.
- `fetch` is called with `cache: 'no-store'` to always get fresh data (no
  stale cache after a new scan is created).
- The scan ID is URL-encoded via `encodeURIComponent` before being placed in
  the path, preventing path traversal and malformed URLs.
- `ApiError.body` preserves the structured `{ error: { code, message } }`
  response for debugging, but the Error `message` is generic (`"API error 500"`)
  so server internals never leak into UI error displays.
- `readBody` reads the response as text first, then attempts JSON parsing —
  this avoids the "Body is unusable" error from calling `text()` and `json()`
  on the same `Response` stream.

---

## 4. Presentation Components

File: `apps/web/src/components/ScanViews.tsx`

All components are **pure** — they receive data as props, render HTML, and
access no external state. The `next/link` `Link` component provides client-side
navigation between history and detail.

| Component        | Props                            | Purpose                                                     |
| ---------------- | -------------------------------- | ----------------------------------------------------------- |
| `ScanCard`       | `{ scan: ScanSummary }`          | Compact card per scan: target, hostname, status, date, link |
| `ScansHistory`   | `{ scans: ScanSummary[] }`       | History list — renders cards, empty state, or               |
| `ScansError`     | (none)                           | API failure display                                         |
| `ScanNotFound`   | `{ id: string }`                 | 404 display with scan ID + back link                        |
| `ScanDetailView` | `{ result: ScanDetailResponse }` | Full detail: metadata, snapshot, detections, evidence       |
| `EvidenceList`   | `{ evidence: Evidence[] }`       | (private) Renders evidence items per type                   |

### Layout hierarchy (detail view)

```
<article>
  <header>
    <h1>Scan #{id}</h1>
    <span class="statusBadge status-{status}">Status</span>
  </header>
  <dl>  ← target, hostname, created, started, completed, failedAt, error
  <section>Snapshot</section>  ← only when snapshot !== null
  <section>Detections (N)</section>
    <ul>
      <li>Technology name, confidence%, category
        <ul>Evidence items (type-labeled)</ul>
      </li>
    </ul>
</article>
```

Status labels map domain status strings to human-readable text:
`completed` → "Completed", `failed` → "Failed", `running` → "Running",
`pending` → "Pending".

---

## 5. Scan History Page (`/scans`)

File: `apps/web/src/app/scans/page.tsx`

A **server component** that:

1. Calls `fetchScans()` (the typed API client) on the server.
2. On success: renders `<ScansHistory scans={data.scans} />`.
3. On error (API failure/500): renders `<ScansError />`.
4. On empty: `<ScansHistory>` handles the empty state internally.

Each scan card links to `/scans/{id}` via Next.js `Link`, enabling client-side
navigation.

```tsx
export default async function ScansPage() {
  try {
    const data = await fetchScans();
    return (
      <main className={styles.main}>
        <h1>DevLens</h1>
        <p>Scan History</p>
        <ScansHistory scans={data.scans} />
      </main>
    );
  } catch {
    return (
      <main className={styles.main}>
        <h1>DevLens</h1>
        <p>Scan History</p>
        <ScansError />
      </main>
    );
  }
}
```

---

## 6. Scan Detail Page (`/scans/[id]`)

File: `apps/web/src/app/scans/[id]/page.tsx`

A **server component** using Next.js 15's async `params` pattern:

```tsx
export default async function ScanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await fetchScanById(id);
    if (result === null) {
      return <ScanNotFound id={id} />;
    }
    return <ScanDetailView result={result} />;
  } catch {
    return <ScansError />;
  }
}
```

Three states handled explicitly:

| State          | API behavior    | UI renders                      |
| -------------- | --------------- | ------------------------------- |
| Scan found     | 200 with result | `ScanDetailView` (full detail)  |
| Scan not found | 404             | `ScanNotFound` (ID + back link) |
| Server error   | 500             | `ScansError`                    |

---

## 7. Navigation

- **`/` → `/scans`**: The homepage already exists; `/scans` is the history page.
- **`/scans` → `/scans/[id]`**: Each `ScanCard` contains a `Link` to
  `/scans/{scan.id}` labeled "View details →".
- **`/scans/[id]` → `/scans`**: The `ScanNotFound` component includes a
  `Link` back to `/scans` labeled "← Back to scan history".
- All navigation uses `next/link`'s `Link` component for client-side
  transitions (no full page reloads).

---

## 8. Important UI States

### History page states

1. **Successful list** — renders `ScansHistory` with all scan cards (completed
   and failed scans together).
2. **Empty** — renders "No scans found. Scans you create will appear here."
3. **API failure** — renders `ScansError` ("Unable to load scans").
4. **Loading** — handled at the server level; the client receives fully
   rendered HTML (no client-side loading spinner required).

### Detail page states

1. **Successful result (completed scan)** — full metadata, snapshot, detections
   with evidence.
2. **404 (unknown scan)** — `ScanNotFound` with the scan ID and a back link.
3. **API failure (500)** — `ScansError`.
4. **Failed scan (200 with `status: "failed"`)** — displayed as a full result
   with error code, error message, and `failedAt` timestamp. Snapshot is `null`
   and detections are empty — the UI renders these states explicitly.

### Failed scan rendering

A failed scan returns **200** from the API (it is a persisted result, not a
client error). The detail view shows:

- Status badge: **Failed**
- An error section: `<code>{error.code}</code>: {error.message}`
- The `failedAt` timestamp
- No snapshot section (snapshot is `null`)
- "No technologies were detected." (detections are empty)

---

## 9. Tests Added

### Component tests — `apps/web/src/components/ScanViews.test.tsx` (20 tests)

Uses `renderToString` from `react-dom/server` and `vi.mock('next/link', ...)` to
render plain `<a>` tags. No DOM environment required.

**ScanCard (5 tests):**

- ✅ Renders the target URL and hostname
- ✅ Renders the scan status as "Completed"
- ✅ Renders the scan status as "Failed" for failed scans
- ✅ Renders a link to the detail page
- ✅ Renders the creation timestamp

**ScansHistory (4 tests):**

- ✅ Renders scans list when scans are present
- ✅ Renders empty state when no scans exist
- ✅ Renders a link to detail for each scan
- ✅ Renders multiple scans with correct statuses

**ScansError (1 test):**

- ✅ Renders an error message

**ScanNotFound (2 tests):**

- ✅ Renders a not-found message with the scan ID
- ✅ Renders a back link to scan history

**ScanDetailView (8 tests):**

- ✅ Renders scan data (target, hostname, timestamps, status)
- ✅ Renders snapshot information when available
- ✅ Renders detections with technology name, confidence, and evidence
- ✅ Renders "No technologies were detected" when detections is empty
- ✅ Handles a failed scan — displays error code and message
- ✅ Does not render snapshot section for failed scans
- ✅ Renders detection count in the heading
- ✅ Renders evidence for each evidence type (all 8 types)

### API client tests — `apps/web/src/lib/api.test.ts` (11 tests)

Uses mocked `global.fetch` and `mockFetch`/`mockTextFetch` helpers.

**fetchScans (5 tests):**

- ✅ Returns the list of scans on 200
- ✅ Returns an empty list when no scans exist
- ✅ Includes failed scans in the list
- ✅ Throws ApiError on 500
- ✅ Does not leak the raw error body on 500

**fetchScanById (6 tests):**

- ✅ Returns the scan detail on 200
- ✅ Returns null for a 404 (unknown scan)
- ✅ Returns a failed scan as a valid 200 result
- ✅ Throws ApiError on 500
- ✅ Encodes special characters in the scan ID
- ✅ Does not leak raw error body on 500

---

## 10. Failed Scan Semantics

The UI preserves the critical Step 21 distinction between "scan doesn't exist"
and "scan exists but failed":

| API Response             | UI Behavior                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| 200, `status: completed` | Full detail view with snapshot                                                            |
| 200, `status: failed`    | Detail view showing error code/message, failedAt timestamp, no snapshot, empty detections |
| 404                      | `ScanNotFound` page                                                                       |
| 500                      | `ScansError` page                                                                         |

The failure information (error code + message) is rendered in a structured
`<dl>` entry with the `<code>` element around the error code, matching the
API response shape exactly. No additional detection logic or error inference
is performed in the UI — it only displays what the API returns.

---

## 11. Evidence Rendering

The `EvidenceList` component handles all 8 evidence types returned by the API,
rendering each with a human-readable label and structured layout:

| Evidence type       | Rendered as                                             |
| ------------------- | ------------------------------------------------------- |
| `html_header`       | **HTTP Header** — `{name}: {value}`                     |
| `meta_tag`          | **Meta Tag** — `{name}: {content}`                      |
| `script_url`        | **Script URL** — `{url}`                                |
| `script_content`    | **Script Content** — `<code>{snippet}</code>`           |
| `html`              | **HTML** — selector: `<code>{selector}</code>`, snippet |
| `javascript_global` | **JavaScript Global** — `{globalName}`                  |
| `resource`          | **Resource** — `{url}`                                  |
| `link`              | **Link** — `{url}`                                      |

Evidence items are type-discriminated using the `type` field, and TypeScript's
discriminated union narrowing ensures each branch accesses only the
fields that exist for that evidence type.

---

## 12. Security / Exposure Audit

- **No database access** — UI components and the API client never import
  `@devlens/database` or `@devlens/application`. The browser only calls HTTP
  endpoints.
- **Error message containment** — `ApiError.message` is always a generic
  `"API error {status}"` string. Raw server error bodies (which may contain DB
  details) are stored in `ApiError.body` for programmatic use but are **never**
  rendered directly in error components — `ScansError` shows a static message.
- **URL encoding** — scan IDs are `encodeURIComponent`-encoded before being
  placed in API paths, preventing path traversal or URL injection.
- **XSS prevention** — React's `renderToString` and JSX escaping automatically
  neutralize any malicious content in scan URLs, hostnames, or evidence values.
- **No SSRF surface** — the UI only reads persisted data; it does not trigger
  any crawling or outbound HTTP requests.
- **No new dependencies** with known vulnerabilities were introduced.

---

## 13. Changes Made

### New files

| File                                          | Purpose                                                |
| --------------------------------------------- | ------------------------------------------------------ |
| `apps/web/src/lib/types.ts`                   | Shared response types (8 types + 1 alias)              |
| `apps/web/src/lib/api.ts`                     | API client (`fetchScans`, `fetchScanById`, `ApiError`) |
| `apps/web/src/lib/api.test.ts`                | 11 API client tests (mocked fetch)                     |
| `apps/web/src/components/ScanViews.tsx`       | 6 presentation components                              |
| `apps/web/src/components/ScanCard.module.css` | CSS styles for all components                          |
| `apps/web/src/components/ScanViews.test.tsx`  | 20 component tests (renderToString)                    |
| `apps/web/src/app/scans/page.tsx`             | Scan history page (server component)                   |
| `apps/web/src/app/scans/page.module.css`      | Page-level styles                                      |
| `apps/web/src/app/scans/[id]/page.tsx`        | Scan detail page (server component)                    |
| `apps/web/src/app/scans/[id]/page.module.css` | Detail page styles                                     |

### Modified files

| File                     | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/tsconfig.json` | Added `baseUrl` + `paths` for `@/*` alias (enables `@/lib/api` imports in server components)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `vitest.config.ts`       | Added custom `jsxTransform` plugin (`enforce: 'pre'`) that uses `esbuild.transformSync` to compile `.tsx` JSX to `react/jsx-runtime` calls before Vite's own import-analysis plugin runs. The web app's `tsconfig.json` has `jsx: "preserve"` (required by Next.js), which Vite's built-in esbuild/oxc transformer would otherwise read, causing `.tsx` files to fail parsing during test import analysis. The custom plugin bypasses this by transforming JSX before any other Vite plugin sees the source. |

### Unchanged files (verified untouched)

- `apps/web/src/app/api/scans/handler.ts` — POST handler
- `apps/web/src/app/api/scans/route.ts` — POST route
- `apps/web/src/app/page.tsx` — homepage
- `apps/web/src/app/layout.tsx` — root layout
- All `@devlens/*` packages — no changes

---

## 14. Deferred Features

| Feature                  | Reason for deferral                                       |
| ------------------------ | --------------------------------------------------------- |
| Pagination / sorting     | Step 22 spec forbids; API returns full list               |
| Search / filtering       | Not requested; API returns all scans                      |
| Authentication           | Not part of current product stage                         |
| Live polling             | Not needed; server-rendered pages are fresh on navigation |
| Client-side navigation   | Uses `next/link` but no SPA shell or client-side state    |
| Charts / analytics       | Not requested                                             |
| Scan creation from UI    | Only the existing POST API exists; no UI form             |
| Dark mode                | Not requested                                             |
| Responsive mobile layout | CSS is functional but not mobile-optimized                |

---

## 15. Validation Results

All five validation checks pass:

| Check                 | Command                                              | Result                           |
| --------------------- | ---------------------------------------------------- | -------------------------------- |
| TypeScript type check | `pnpm typecheck`                                     | ✅ Pass                          |
| Tests                 | `pnpm test`                                          | ✅ Pass (974 passed, 18 skipped) |
| Lint + format         | `pnpm lint`                                          | ✅ Pass                          |
| Build                 | `pnpm build`                                         | ✅ Pass                          |
| Circular deps         | `npx madge --circular --extensions ts packages apps` | ✅ Pass (0 circular, 160 files)  |

### Build output

Next.js build produces all routes:

```text
Route (app)
├── ○ /                                           228 B
├── ○ /_not-found                                 990 B
├── ƒ /api/scans                                  131 B
├── ƒ /api/scans/[id]                             131 B
├── ƒ /scans                                      642 B
└── ƒ /scans/[id]                                 657 B
```

The `/scans` and `/scans/[id]` pages are server-rendered on demand (`ƒ`),
while the API routes remain server-side functions.

### Baseline comparison

```text
Step 20 → Step 21 → Step 22 test counts:
  916 baseline → 943 → 974 passed (+31 new tests in Step 22)
  18 skipped (unchanged — PostgreSQL integration tests without DATABASE_URL)
```

### Implementation notes

1. **Custom `jsxTransform` plugin in `vitest.config.ts`**: The web app's
   `tsconfig.json` requires `jsx: "preserve"` for Next.js (the `next build`
   step resets any other value). This causes Vite's built-in `vite:import-analysis`
   plugin to fail when parsing `.tsx` files during testing. The solution is a
   custom Vite plugin with `enforce: 'pre'` that uses `esbuild.transformSync`
   to compile JSX to `react/jsx-runtime` calls before any other plugin processes
   the file. This affects only the test runner — the production build is
   untouched.

2. **`@/*` path alias in `tsconfig.json`**: Added `baseUrl` and `paths` mapping
   so that TypeScript resolves `@/` imports. Next.js handles this automatically
   at build time, but `tsc --noEmit` (used by `pnpm typecheck`) needs the
   explicit mapping. Prettier reformatted the tsconfig to a compact form.

3. **`ScanSummary` type alias**: Added as `export type ScanSummary = ScanResponse`
   in `types.ts` to provide a semantically distinct name for scan summaries
   used in list contexts, while keeping `ScanResponse` as the canonical type
   name matching the API contract.

4. **CSS module `?? ''` fallback**: `statusClass` uses `styles.statusX ?? ''`
   because `exactOptionalPropertyTypes` makes CSS module values potentially
   `undefined` at type level.

5. **`React.ReactElement` return types**: All components in `ScanViews.tsx`
   use `React.ReactElement` as the return type (rather than `JSX.Element`)
   because `@types/react` is configured with the `jsx: "preserve"` setting,
   and `React.ReactElement` is available as a global type via `@types/react`.

6. **`vi.mock('next/link')` in component tests**: Next.js's `Link` component
   uses React hooks that require a router context, which is unavailable in the
   node test environment. The mock renders a plain `<a>` tag, allowing the
   tests to verify `href` attributes without a browser/DOM.
