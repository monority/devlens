# DevLens — Step 87: Surface Integrity in Scan Comparison

## Mission

Carry the detection-integrity verdict (computed server-side by Step 81,
surfaced in the single-scan detail UI by Step 86) into the **scan
comparison** workflow, where it was previously silently unused.

A user comparing scan A and scan B should be able to understand whether a
technology's structural integrity state:

- remained valid;
- became invalid (regressed);
- became valid (recovered);
- changed between two invalid states (issue set changed);
- appeared/disappeared together with a detection.

This step closes a concrete data-flow gap: `DetectionResponse.integrity`
was already available in the comparison data structures but was never
read by the comparison logic or rendered in the comparison UI.

---

## 1. Objective

Make integrity-verdict changes visible in the scan comparison view,
reusing the existing Step 81 integrity contract and the Step 86
presenter. Integrity is a **secondary signal** in the comparison — it
does not alter the primary `DetectionChangeKind` classification
(`version_changed → provenance_changed → confidence_changed →
unchanged`) nor the existing detection matching semantics.

---

## 2. Original Data-Flow Gap

The comparison pipeline (`comparison.ts::compareScans`) already carries
full `DetectionResponse` objects for each technology's before/after pair:

```ts
interface TechnologyComparison {
  before: DetectionResponse | null;
  after: DetectionResponse | null;
  // ...
}
```

`DetectionResponse.integrity` (`{ valid: boolean; issues: readonly DetectionIntegrityIssue[] }`)
is present only when `valid === false` (Step 81 §10: absent = valid).
Despite this field being available on both `before` and `after`, the
comparison logic never read it, and `ScanComparison.tsx` never rendered
it — so integrity regressions or recoveries between scans were
invisible.

---

## 3. Existing Comparison Matching Semantics

Technology identity uses the stable `technology.id` from the API
response — NOT display name and NOT array ordering. Each technology
present across either scan yields exactly one `DetectionChange`
record, classified by priority:

```
added → removed → version_changed → provenance_changed → confidence_changed → unchanged
```

For technologies present in both scans (`before` and `after` both
non-null), secondary signals (`evidenceChanged`, `provenanceChanged`,
`confidenceDelta`, `version`) are computed alongside the primary
`kind`. Integrity follows this same secondary-signal pattern — it is
**not** a primary classification tier.

---

## 4. Integrity Comparison Semantics

### `integrityKey(d: DetectionResponse | null): string`

Normalizes a detection's integrity verdict into a stable comparison key.

- `null` / absent `integrity` / `valid: true` → `'valid'`
- `valid: false, issues: [...]` → `'invalid:<issue1>,<issue2>'`

Issues are joined in their existing canonical order (Step 81 §12:
`INTEGRITY_ISSUE_ORDER`), which is established upstream by
`computeDetectionIntegrity`. No reordering is performed here — the
comparison layer is a consumer of the canonical ordering, not a
re-definer of it.

### `computeIntegrityChange(before, after): boolean`

- Returns `false` if either side is `null` (added/removed technologies
  have nothing to compare — integrity information "belongs to" the
  detection as-is).
- Otherwise returns `true` if `integrityKey(before) !== integrityKey(after)`.

This mirrors the existing `computeProvenanceChange` pattern exactly.

### Transition Matrix

| Before                | After                      | `integrityChanged`     |
| --------------------- | -------------------------- | ---------------------- |
| valid (absent)        | valid (absent)             | `false`                |
| valid (absent)        | invalid (issues)           | `true`                 |
| invalid (issues)      | valid (absent)             | `true`                 |
| invalid (same issues) | invalid (same issues)      | `false`                |
| invalid (same issues) | invalid (different issues) | `true`                 |
| invalid (superset)    | invalid (subset)           | `true` (issue removed) |
| invalid (subset)      | invalid (superset)         | `true` (issue added)   |
| N/A (added detection) | invalid                    | `false` (no `before`)  |
| invalid               | N/A (removed detection)    | `false` (no `after`)   |

### `hasChanges`

Updated to also check `c.integrityChanged`:

```ts
const hasChanges = changes.some(
  (c) => c.kind !== 'unchanged' || c.evidenceChanged || c.integrityChanged,
);
```

An integrity-only change sets `hasChanges === true` while `kind` remains
`'unchanged'`.

---

## 5. Integrity Diff Representation

### `TechnologyComparison.integrityChanged: boolean`

Secondary flag on each `DetectionChange`. `true` when the integrity
verdict differs between before/after for a technology present in both
scans.

### `ComparisonResult.integrityChanges: DetectionChange[]`

Derived view: `changes.filter((c) => c.integrityChanged)`, inheriting
the canonical `(kind priority ASC, id ASC)` ordering of `changes`.

---

## 6. UI Behavior

`ScanComparison.tsx` adds an **"Integrity changes"** section in the
`TechnologyChanges()` render, positioned after provenance changes and
before score/confidence changes. The section renders only when
`result.integrityChanges.length > 0`.

Each `IntegrityChangeItem` renders:

- An amber badge (`integrityChangeBadge`) labeled "integrity changed"
- Technology name and category
- `Before: <label>` — human-readable verdict from the Step 86 presenter
  (e.g. "Valid" or "Duplicate evidence, Provenance mismatch")
- `After: <label>` — same presenter for the after side

Labels are produced by `integrityIssueLabel()` from
`detection-integrity-presenter.ts` — the shared Step 86 presenter. No
issue-label mapping is duplicated in the UI.

CSS classes use the existing amber warning palette (`#fef3c7` /
`#92400e`), consistent with `.detectionIntegrityNotice` from Step 86.

---

## 7. Presenter Reuse

`integrityIssueLabel()` and `integrityIssueDescription()` from
`apps/web/src/lib/detection-integrity-presenter.ts` (Step 86) are reused
without modification. The presenter already provides:

- `INTEGRITY_ISSUE_LABELS` — canonical label + description for each
  `DetectionIntegrityIssue`
- `integrityIssueLabel(issue: DetectionIntegrityIssue): string`

No new presenter functions or label mappings were added.

---

## 8. Test Matrix

### Pure comparison logic (`comparison.test.ts`)

| Test                       | Scenario                                                   | Expected                                             |
| -------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| valid → invalid            | clean → `{ valid: false, issues: ['DUPLICATE_EVIDENCE'] }` | `integrityChanged: true`, in `integrityChanges`      |
| invalid → valid            | `{ valid: false, issues: [...] }` → clean                  | `integrityChanged: true`                             |
| same issues                | same issue set on both sides                               | `integrityChanged: false`, not in `integrityChanges` |
| different issue sets       | `DUPLICATE_EVIDENCE` → `PROVENANCE_MISMATCH`               | `integrityChanged: true`                             |
| both valid                 | no integrity field on either side                          | `integrityChanged: false`                            |
| issue added                | subset → superset                                          | `integrityChanged: true`                             |
| issue removed              | superset → subset                                          | `integrityChanged: true`                             |
| neither side has integrity | both absent                                                | `integrityChanged: false`                            |
| added detection            | only in right scan                                         | `integrityChanged: false`, `kind: 'added'`           |
| removed detection          | only in left scan                                          | `integrityChanged: false`, `kind: 'removed'`         |
| canonical ordering         | multiple issues in canonical order                         | key joins issues in canonical order                  |
| deterministic output       | JSON-serializable, stable across calls                     | `JSON.stringify(a) === JSON.stringify(b)`            |
| integrity-only change      | same confidence/evidence/version                           | `hasChanges: true`, `kind: 'unchanged'`              |

### UI rendering (`ScanComparison.test.tsx`) — `renderToString`

| Test                                     | Scenario                                 | Expected                                                                  |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| renders section for valid → invalid      | clean → DUPLICATE_EVIDENCE               | "Integrity changes (1)", "Before: Valid", "After: Duplicate evidence"     |
| before/after labels for issue-set change | DUPLICATE_EVIDENCE → PROVENANCE_MISMATCH | "Before: Duplicate evidence", "After: Provenance mismatch"                |
| no section when both valid               | no integrity on either side              | no "Integrity changes" in HTML                                            |
| no section when identical issues         | same issues on both sides                | no "Integrity changes" in HTML                                            |
| renders section for invalid → valid      | PROVENANCE_MISMATCH → clean              | "Before: Provenance mismatch", "After: Valid"                             |
| coexists with score changes              | integrity change + confidence change     | both "Integrity changes" and "Score / confidence changes" sections render |

---

## 9. Validation Results

```
$ pnpm exec vitest run
Test Files  124 passed | 2 skipped (126)
Tests       2405 passed | 18 skipped (2423)
Duration    6.09s

$ pnpm typecheck
✓ All packages: exit 0

$ npx eslint apps/web/src/lib/comparison.ts \
  apps/web/src/components/ScanComparison.tsx \
  apps/web/src/lib/comparison.test.ts \
  apps/web/src/components/ScanComparison.test.tsx
✓ exit 0, no errors

$ npx prettier --check <modified files>
✓ All matched files use Prettier code style!

$ pnpm -r build
✓ All packages built successfully. 10/10 routes prerendered including
  /scans/compare.
```

**Baseline:** 2387 passed, 18 skipped (Step 86 commit `9fdd65c`).
**After Step 87:** 2405 passed (18 new tests), 18 skipped — no regressions.
The 2 skipped files (`postgres-repository.test.ts` + `route.integration.test.ts`)
require PostgreSQL and were already skipped before Step 87.

---

## 10. Rendering Verification

The repository uses `react-dom/server`'s `renderToString` for component
verification (no Playwright E2E suite — `e2e/` contains only `.gitkeep`
and an old audit doc). The Step 87 verification is performed via the
`ScanComparison.test.tsx` component tests:

- ✅ `ScanComparison` renders with no integrity changes (section absent,
  no noise)
- ✅ valid → invalid renders the "Integrity changes" section with
  correct "Before: Valid" / "After: Duplicate evidence" labels
- ✅ invalid → valid renders the section with "Before: Provenance
  mismatch" / "After: Valid" labels
- ✅ unchanged integrity (identical issues) does not create noise
- ✅ before/after labels come from the shared Step 86 presenter
  (`integrityIssueLabel`)
- ✅ existing comparison sections (Score/confidence changes) still render
  alongside the integrity section
- ✅ existing sections (Version changes, Evidence changes, Provenance
  changes, Present in both, Added/Removed) remain intact (existing tests
  all pass)

The `/scans/compare` route builds and prerenders successfully in the
production build.

---

## 11. Non-Goals

This step does **not**:

- modify the integrity algorithm (`computeDetectionIntegrity` in
  `@devlens/core`);
- alter `classifyChange()` priority or the `DetectionChangeKind` enum;
- alter detection identity/matching semantics;
- modify `DetectionResponse` or the API response shape;
- modify the database schema or persistence layer;
- alter detection scoring or confidence computation;
- add new API endpoints;
- add queues or worker changes;
- redesign the comparison page;
- add a new dashboard or chart;
- revive Step 82;
- create Step 88 or any subsequent step.

---

## 12. Relationship to Prior Steps

- **Step 81** — `computeDetectionIntegrity()` produces the
  `DetectionIntegrity` verdict (`{ valid, issues }` in canonical order).
  `integrityKey()` reads this same shape without recomputation.
- **Step 86** — `detection-integrity-presenter.ts` provides
  `integrityIssueLabel()` / `integrityIssueDescription()`. `IntegrityChangeItem`
  reuses `integrityIssueLabel()`; no label mapping is duplicated.
- **Step 74** — `comparison.ts` established the `TechnologyComparison`
  / `DetectionChange` model with `before`/`after` full detections and
  secondary signals (`evidenceChanged`, `provenanceChanged`,
  `scoreChanged`). Integrity is added as another secondary signal in the
  same pattern.

---

## 13. Files Changed

Source:

| File                                          | Change                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/comparison.ts`              | `integrityKey()`, `computeIntegrityChange()`, `integrityChanged` field, `integrityChanges` view, `hasChanges` update |
| `apps/web/src/components/ScanComparison.tsx`  | `IntegrityChangeItem` component, "Integrity changes" section rendering                                               |
| `apps/web/src/components/ScanCard.module.css` | `.integrityChangeBadge`, `.integrityBefore`, `.integrityAfter` classes                                               |

Tests:

| File                                              | Change                            |
| ------------------------------------------------- | --------------------------------- |
| `apps/web/src/lib/comparison.test.ts`             | 11 new integrity comparison tests |
| `apps/web/src/components/ScanComparison.test.tsx` | 6 new rendering tests             |

Documentation:

| File             | Change                            |
| ---------------- | --------------------------------- |
| `docs/Step87.md` | This implementation specification |
