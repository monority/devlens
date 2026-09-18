# DevLens — Step 52 — Global Application Navigation

## Context

Steps 44–51 are complete.

Current product surfaces:

- `/` — real Home Dashboard
- `/scans/new` — scan creation
- `/scans` — scan history + filtering + comparison selector
- `/scans/{id}` — rich scan detail
- `/scans/compare` — complete scan comparison
- `/technologies` — technology catalog
- `/technologies/{id}` — technology detail

Recent validated state:

- 1596 Vitest tests passed
- 18 skipped
- TypeScript passes
- ESLint passes
- Prettier passes
- Next build passes
- madge reports no circular dependencies

Step 51 explicitly identified persistent navigation as the remaining cross-page UX gap.

## Objective

Implement a small, reusable, production-quality global navigation for the DevLens application.

This is a UX/layout step only.

Do NOT modify scan-domain logic, detectors, crawler behavior, comparison semantics, persistence, API contracts, technology detection, or scoring.

---

## Step 0 — Inspect before editing

Inspect the current Next.js App Router structure and existing layouts/components.

Determine:

- current `app/layout.tsx`
- existing global CSS/layout conventions
- whether any navigation/header component already exists
- whether any page currently defines its own top-level navigation
- how links are currently styled
- whether the application already has a reusable button/link primitive

Do not create duplicate primitives if existing ones can be reused.

---

## Required navigation

Create a persistent application header/navigation visible across the main DevLens surfaces.

Navigation should contain:

- DevLens brand → `/`
- Scans → `/scans`
- New Scan → `/scans/new`
- Technologies → `/technologies`

The navigation should make the application structure immediately understandable.

Keep it deliberately small.

Do NOT add:

- fake user/account controls
- authentication UI
- notifications
- settings
- search
- unnecessary dropdowns
- decorative dashboard controls
- fabricated product features

---

## Architecture

Prefer:

`app/layout.tsx`
→ global application shell/header
→ `{children}`

The navigation should be implemented once at the application layout level rather than copied into individual pages.

Prefer a server-compatible implementation.

Do not introduce client-side state unless genuinely required.

Use Next.js `<Link>` for internal navigation.

Do not introduce a new dependency.

---

## Active route state

If the existing project conventions support it cleanly, indicate the current section.

For example:

- `/scans`
- `/scans/new`
- `/scans/{id}`
- `/scans/compare`

should identify as belonging to the Scans section.

Likewise:

- `/technologies`
- `/technologies/{id}`

should identify as belonging to Technologies.

Important:

Do not add unnecessary client-side complexity merely to achieve active states.

If active-route detection requires a client component, keep that component extremely small and isolated.

Do not convert the entire application layout into a client component.

---

## Responsive behavior

The navigation must remain usable on:

- desktop
- tablet
- mobile

For mobile:

- avoid horizontal overflow
- keep all primary destinations reachable
- do not introduce an unnecessarily complex hamburger/menu system unless the existing design genuinely requires it

A compact wrapping/navigation layout is acceptable if it remains clear and usable.

---

## Visual direction

Match the existing DevLens visual language.

Requirements:

- restrained
- professional
- product-oriented
- clear hierarchy
- accessible contrast
- subtle borders/background treatment if consistent with existing styles
- no gradients
- no glow effects
- no excessive glassmorphism
- no giant hero/header
- no decorative animation
- no unnecessary icons

The header should feel like application chrome, not a marketing landing-page component.

---

## Integration

The existing pages must continue rendering normally beneath the global navigation.

Check especially:

- `/`
- `/scans`
- `/scans/new`
- `/scans/{id}` using an existing valid ID if practical
- `/scans/compare`
- `/technologies`
- `/technologies/{id}` using an existing valid technology ID

Do not alter their business behavior.

If any page already has redundant navigation/back links, preserve their semantic purpose unless the new global navigation makes a specific duplicate genuinely unnecessary.

Do not remove useful contextual navigation such as:

- "Back to scan history"
- comparison-specific navigation
- scan detail contextual links

Global navigation and contextual navigation serve different purposes.

---

## Accessibility

Implement:

- semantic `<header>`
- semantic `<nav aria-label="Primary">` or equivalent
- keyboard-accessible links
- visible focus state
- meaningful link text
- correct heading structure
- no navigation information conveyed by color alone

If active navigation is visually indicated, also expose the active state semantically where appropriate.

---

## Tests

Add focused tests for the navigation component.

Cover at minimum:

1. DevLens brand links to `/`
2. Scans links to `/scans`
3. New Scan links to `/scans/new`
4. Technologies links to `/technologies`
5. semantic navigation structure exists
6. all primary destinations are present
7. active section behavior if implemented
8. no duplicate navigation destinations are generated accidentally

Follow the existing project's testing conventions.

Do not add brittle implementation-detail tests.

---

## Scope constraints

This step MUST NOT:

- modify `@devlens/core`
- modify detector logic
- modify crawler logic
- modify comparison logic
- modify scoring
- modify persistence
- modify API contracts
- modify scan creation behavior
- modify technology catalog semantics
- add authentication
- add analytics
- add a command palette
- add search
- redesign existing pages
- add a mobile application menu unless necessary
- introduce dependencies

This is a global navigation/layout increment.

---

## Validation

Run:

1. targeted navigation tests
2. full Vitest suite
3. `tsc --noEmit`
4. ESLint
5. Prettier check
6. `next build`
7. madge circular-dependency check

All must pass.

Also verify that the global layout does not cause hydration errors or client/server boundary problems.

---

## Final report

Report:

### Implementation
- files created/modified
- navigation architecture
- layout integration
- active-route behavior, if any
- responsive behavior

### Accessibility
- semantic structure
- keyboard/focus behavior
- active-state semantics

### Tests
- targeted test count
- full test count

### Validation
- typecheck
- lint
- formatting
- build
- dependency/cycle check

### Scope
Explicitly confirm that domain, API, crawler, detectors, comparison, scoring, persistence, and technology semantics were untouched.

Do NOT proceed automatically to a Step 53.