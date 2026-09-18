# DevLens — Step 57: Scan History & Same-Target Context

## Context

Step 56 — Re-scan Same Target is COMPLETE.

Current verified state:
- `ScanResponse.scan.target` is always available for persisted scans.
- `/scans/[id]` exposes a Re-scan action.
- Re-scan creates a NEW scan through the existing `POST /api/scans` flow.
- `/scans/new?target=...` pre-fills the target without auto-submitting.
- 1649 Vitest tests pass, 18 skipped.
- tsc, ESLint, Prettier, `next build`, and madge all pass.

The next increment should improve the scan-history UX without changing the scan engine or introducing speculative architecture.

## Goal

Make `/scans` a useful scan history rather than only a list of independent scan records.

A user who scans the same target multiple times must be able to distinguish those scans quickly and understand their temporal relationship.

Do NOT redesign the application. Extend the existing UI/data flow with the smallest coherent implementation.

---

## Step 0 — Inspect before editing

Inspect the existing implementation of:

- `/scans`
- `ScanCard`
- scan list/query functions
- scan persistence/repository
- `ScanResponse`
- scan timestamps / lifecycle fields
- `/scans/[id]`
- existing target display/normalization utilities
- existing tests for scan listing and scan detail

Answer these questions from the actual repo:

1. What timestamp/date field already exists on scans?
2. Is scan ordering already deterministic?
3. Is target stored raw, normalized, or both?
4. Does the scan list already expose enough information to identify:
   - target
   - status
   - date/time
   - technology/result count?
5. Is there already a utility for formatting or normalizing scan targets?
6. Can same-target grouping be implemented entirely at the presentation/query layer without modifying persistence?

Do NOT create duplicate domain concepts if the repository already has the required information.

---

## Functional requirements

### 1. Scan history ordering

Ensure `/scans` displays scans in deterministic reverse chronological order.

Rules:

- newest scan first;
- deterministic tie-breaker using the existing stable identifier when timestamps are equal;
- do not use array/object insertion order as an implicit ordering contract.

If this is already implemented correctly, preserve it and add regression coverage rather than rewriting it.

---

### 2. Make repeated scans distinguishable

Each scan entry should expose enough information to answer:

- What target was scanned?
- When was it scanned?
- What was its status?
- Can I open the scan?

Use existing design language and components.

Do not add large cards, dashboards, charts, badges everywhere, or a new visual system.

Keep the existing compact/premium DevLens style.

---

### 3. Same-target context

When multiple scans of the same target exist, expose a lightweight indication that the target has been scanned before.

Examples of acceptable implementations:

- "3 scans"
- "Previous scans"
- a compact count next to the target
- a contextual link from the latest scan to the scan history

Choose ONE coherent implementation based on the existing UI.

Do not create a new dedicated comparison system in this step.

Do not automatically group or collapse scan records if that would hide individual scans.

Every scan must remain directly accessible.

---

### 4. Target identity

Use the existing target representation and normalization utilities.

Do NOT invent a new URL normalization algorithm.

The UI may display a human-readable target, but scan identity must continue using the existing canonical/domain rules.

Special cases must remain safe:

- query strings
- fragments
- encoded URLs
- trailing slashes
- failed scans
- malformed/unusual user input already accepted by the existing validation layer

Do not change `validateUrl()` unless absolutely required by an existing failing test.

---

### 5. Preserve Re-scan flow

The Step 56 Re-scan behavior must remain unchanged:

`Scan Detail`
→ `Re-scan`
→ `/scans/new?target=...`
→ prefilled form
→ explicit user submission
→ NEW scan

Do not turn this into retry/update-in-place.

Do not mutate the previous scan.

---

## Data/API constraints

Prefer existing scan data.

Do NOT:

- add a new database table;
- add a scan-history subsystem;
- add a new API endpoint;
- modify the scan engine;
- duplicate scan persistence;
- introduce client-side global state;
- add a generic event system.

If same-target counting requires a query/repository enhancement, implement the smallest repository-level capability that is actually justified by the existing architecture.

If the existing list already contains all scans, prefer deriving the count in the application layer rather than adding unnecessary persistence/query complexity.

---

## Testing

Add focused tests for the actual implementation.

At minimum cover:

1. scans are ordered newest → oldest;
2. equal timestamps have deterministic ordering;
3. two scans of the same target are recognized as the same target;
4. different targets are not grouped together;
5. repeated scans remain individually clickable;
6. failed scans remain visible and distinguishable;
7. Re-scan link from Step 56 remains intact;
8. special URL characters do not break target display/link behavior.

If the repository already has stronger relevant tests, extend them instead of duplicating them.

---

## Accessibility

Preserve existing accessibility conventions.

Any newly interactive element must have:

- keyboard accessibility;
- visible `:focus-visible`;
- meaningful accessible name;
- no reliance on color alone.

Do not add unnecessary interaction.

---

## Scope

### IN SCOPE

- scan history ordering;
- clearer scan metadata;
- lightweight same-target context;
- deterministic same-target derivation;
- focused tests;
- accessibility polish required by the change.

### OUT OF SCOPE

- scan comparison redesign;
- diffing results;
- technology trend charts;
- scan scheduling;
- background workers;
- notifications;
- authentication;
- scan deletion;
- scan retention;
- pagination unless the existing implementation is already at a clear correctness boundary;
- database schema redesign;
- API redesign;
- crawler/detector changes;
- new visual design system.

Do not proceed into Step 58 automatically.

---

## Validation

Run:

1. focused tests for changed scan-history/list/detail components;
2. full Vitest;
3. TypeScript;
4. ESLint;
5. Prettier;
6. `next build`;
7. madge/circular dependency check if part of the existing validation workflow.

No regressions are acceptable.

---

## Final report

Return:

1. STATUS
2. Commit
3. Step 0 findings
4. Files changed
5. Exact implementation
6. Same-target identity logic used
7. Ordering logic
8. Accessibility changes
9. Tests added
10. Full validation results
11. Any architectural issue discovered
12. Explicit confirmation that Re-scan semantics from Step 56 remain unchanged
13. Scope confirmation

Do not implement the next step automatically.