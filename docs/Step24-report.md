# Step 24 — Scan Lifecycle Polling

> **Status**: ✅ Complete — all 5 validation checks pass

---

## Overview

Step 24 adds **lifecycle-aware polling** to the `/scans/[id]` page so that
in-progress scans (pending/running) auto-refresh until they reach a terminal
state (completed/failed). The `/scans` history page shows all statuses
without live polling, and `/scans/new` is unchanged functionally.

**Test count**: 1006 (Step 23 baseline) → **1030** (+24 tests)

---

## Constraints Honored

- **No new dependencies** — React built-ins only (`useState`, `useEffect`,
  `useRef`, `setInterval`). No WebSockets, SSE, React Query, SWR, or global
  state managers.
- **No backend changes** — POST endpoint and repository layer untouched.
- **Node test environment** — `environment: 'node'`, no jsdom. `renderToString`
  from `react-dom/server` for component rendering; mocked `global.fetch` for
  API client tests.

---

## Architecture

```
/scans/[id]/page.tsx  (server) → initial fetchScanById()
        ↓
        ScanLifecycle   (client: 'use client') → periodic refetch
        ↓
        ScanDetailView  (pure presentation)
```

- **`page.tsx`** (server component) calls `fetchScanById()` at request time,
  gets the current scan state, and passes it as `initialResult` to
  `ScanLifecycle`.
- **`ScanLifecycle.tsx`** (`'use client'`) is the **only** client component
  in the scan detail flow. It hydrates from `initialResult`, then sets up a
  `setInterval` polling loop (2.5 s) — but **only** when the scan status is
  non-terminal.
- **`ScanDetailView.tsx`** (pure presentation) renders the appropriate UI
  for each status variant.

---

## Lifecycle Rules

| State       | Polls? | Behavior                                                           |
| ----------- | ------ | ------------------------------------------------------------------ |
| `pending`   | Yes    | Shows "Queued in progress"; polls `GET /api/scans/:id` every 2.5 s |
| `running`   | Yes    | Shows "Scanning in progress" + startedAt timestamp; same polling   |
| `completed` | No     | Displays snapshot + detections; polling stopped                    |
| `failed`    | No     | Displays error code/message; polling stopped                       |
| 404         | No     | Shows `ScanNotFound`; polling stopped                              |
| Error       | No     | Preserves last known state; polling stopped                        |

Polling is driven by `useEffect` keyed on `result.scan.status` — when the
status changes, the effect re-runs, clearing the old interval and starting a
new one only if the new state is still non-terminal.

---

## Helper Functions (`lib/scan-utils.ts`)

```typescript
export const POLLING_INTERVAL_MS = 2500;

export function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed';
}

export function isScanning(status: string): boolean {
  return status === 'pending' || status === 'running';
}
```

These are pure functions, trivially testable without React or DOM, and reused
by both the client component (to decide whether to start/stop polling) and
the presentation components (to render the correct UI).

**Tests** (`scan-utils.test.ts`): 11 tests — 5 `isTerminal` cases, 5
`isScanning` cases, 1 constant check.

---

## Files Created

| File                                               | Purpose                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/web/src/lib/scan-utils.ts`                   | Pure lifecycle helpers: `POLLING_INTERVAL_MS`, `isTerminal()`, `isScanning()` |
| `apps/web/src/lib/scan-utils.test.ts`              | 11 unit tests for helpers                                                     |
| `apps/web/src/components/ScanLifecycle.tsx`        | `'use client'` component with `setInterval` polling                           |
| `apps/web/src/components/ScanLifecycle.module.css` | `.refreshError` style for transient error messages                            |
| `apps/web/src/components/ScanLifecycle.test.tsx`   | 6 tests for initial render across all states                                  |

---

## Files Modified

### `apps/web/src/components/ScanViews.tsx`

- Imported `isScanning` from `@/lib/scan-utils`
- `ScanDetailView` now renders a **scanning-state section** for `pending` and
  `running` scans:
  - Pending → "Queued in progress" with "queued and waiting to start" message
  - Running → "Scanning in progress" with startedAt timestamp +
    "currently running" message
  - Both show: "Detection results will appear after the scan completes."
- Detection heading shows "pending" count instead of `0` when the scan is
  in-progress
- No snapshot section is rendered for in-progress scans

### `apps/web/src/components/ScanCard.module.css`

- Added `.scanning` class for styling the in-progress indicator in scan cards

### `apps/web/src/components/ScanViews.test.tsx`

- Added `makePendingScan()` and `makeRunningScan()` fixture helpers
- Added tests in `ScanCard`: "Pending" and "Running" status labels
- Added test in `ScansHistory`: all 4 statuses (Completed/Failed/Pending/Running)
  appear in the list
- Added tests in `ScanDetailView`: pending ("Queued in progress"), running
  ("Scanning in progress"), status badges for both states

### `apps/web/src/app/scans/[id]/page.tsx`

- Replaced direct `ScanDetailView` usage with `ScanLifecycle`
- Passes `scanId={id}` and `initialResult={result}` for hydration safety
- Back-to-history links added to all 4 branches (found, not-found, error,
  scanning states)

### `vitest.config.ts`

- Changed `__dirname` → `import.meta.dirname` (fixes Vite config warning)

---

## Import Path Convention Fix

During development, two import-path issues were discovered and resolved:

1. **`@/` alias with `.js` suffix** — Next.js's webpack resolver does not
   resolve `@/lib/scan-utils.js` to `scan-utils.ts`. The Step 22 pages
   worked because they used `@/lib/api` (no `.js`). The convention for `@/`
   aliased imports is to **omit the `.js` extension**.

2. **Relative import with `.js` suffix** — `../lib/scan-utils.js` in
   `ScanViews.tsx` failed because the value import (not type-only) requires
   webpack to actually resolve the file, and `.js` → `.ts` resolution was
   incomplete. Fixed by using `../lib/scan-utils` (no extension).

---

## Validation Results

| Check         | Command                                              | Result                                    |
| ------------- | ---------------------------------------------------- | ----------------------------------------- |
| Typecheck     | `pnpm typecheck`                                     | ✅ All 10 workspaces pass                 |
| Tests         | `pnpm test`                                          | ✅ 1030 passed, 18 skipped (52 files)     |
| Lint          | `pnpm lint`                                          | ✅ ESLint + Prettier clean                |
| Build         | `pnpm build`                                         | ✅ All packages build, routes prerendered |
| Circular deps | `npx madge --circular --extensions ts packages apps` | ✅ No circular dependency                 |

---

## Test Count Breakdown

| Step                    | Tests | Files |
| ----------------------- | ----- | ----- |
| Baseline (Step 20)      | 916   | —     |
| Step 21 (GET API)       | 943   | (+27) |
| Step 22 (Web UI)        | 974   | (+31) |
| Step 23 (Scan Creation) | 1006  | (+32) |
| Step 24 (Lifecycle)     | 1030  | (+24) |

New tests in Step 24:

- `scan-utils.test.ts`: 11 tests (helpers)
- `ScanLifecycle.test.tsx`: 6 tests (initial render for all states)
- `ScanViews.test.tsx`: 7 additional tests (pending/running ScanCard,
  ScansHistory with all statuses, ScanDetailView pending/running states)

---

## Design Decisions

1. **`setInterval` over `setTimeout` recursion** — `setInterval` is simpler,
   and the cleanup function (`return clearPolling`) handles teardown cleanly
   via `useEffect`'s return value.

2. **`renderToString` for initial render only** — `renderToString` from
   `react-dom/server` does not execute `useEffect`, so the polling loop is
   never started during tests. This means we verify the **initial render**
   output (correct content for each state) without mocking timers. Polling
   logic is delegated to pure helpers tested in `scan-utils.test.ts`.

3. **`@/` alias resolution** — The `@/` alias works in vitest (via
   `resolve.alias` in config) and in Next.js builds (via `tsconfig.json`
   `paths`). But `.js` suffixes must be omitted for `@/` imports in Next.js.

4. **Hydration safety** — `ScanLifecycle` initializes `useState` with
   `initialResult` from the server, ensuring the client and server renders
   match. The first `useEffect` does not make an API call until the polling
   interval fires.

5. **Transient error handling** — When a polling fetch fails (non-404),
   `setRefreshError('Failed to refresh. Will retry…')` is called, the last
   known state is preserved, and polling continues. A 404 sets `notFound`
   to `true` and stops polling permanently.
