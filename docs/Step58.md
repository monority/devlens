# DevLens — Step 58: Compare Scans from History

## Context

Step 57 — Scan History & Same-Target Context is COMPLETE.

Verified state:

- Re-scan creates a NEW scan.
- `/scans/new?target=...` pre-fills the target without auto-submit.
- `/scans` is deterministically ordered newest → oldest.
- Same-target context is displayed as a lightweight `N scans` indicator.
- Same-target counts are derived from the full unfiltered scan list.
- Existing ordering contract is `createdAt DESC, scanId ASC`.
- `/scans/compare` already exists in the application.
- 1671 Vitest tests pass, 18 skipped.
- tsc, ESLint, Prettier, `next build`, and madge all pass.

The goal of this step is NOT to invent a new comparison architecture.

The goal is to connect the existing scan history and existing comparison page into one coherent user flow.

---

# Step 0 — Inspect before editing

Inspect the actual implementation of:

- `/scans/compare`
- comparison page
- comparison selector/components
- scan repository/query functions
- `ScanResponse`
- scan history
- `ScanCard`
- existing compare-related tests
- existing URL/query-param handling

Answer:

1. How are scans currently selected for comparison?
2. Does `/scans/compare` already accept scan IDs through query parameters?
3. Can two scans already be selected directly from the existing UI?
4. Does comparison require scans of the same target?
5. What happens when one/both scan IDs are invalid?
6. What happens when fewer than two scans are selected?
7. Does the comparison already expose technology additions/removals/score changes?
8. Is there already a canonical scan ordering that can be reused?

Do not modify code until these questions are answered from the repository.

---

# Goal

Create a clear path:

`/scans`
→ identify repeated target
→ select two scans
→ `/scans/compare`
→ inspect differences

Use the existing comparison implementation wherever possible.

Do not redesign the entire comparison page.

---

# 1. Comparison entry point from scan history

Add a minimal way to select scans from `/scans`.

The exact UI should follow the existing design system and the actual current comparison architecture.

Preferred behavior:

- each scan can be selected for comparison;
- selection is explicit;
- selected scan IDs are visible;
- the user can navigate to the existing `/scans/compare`;
- selecting a scan does NOT navigate immediately;
- selecting the same scan twice is impossible;
- no scan is mutated.

If the existing comparison page already has a better selection mechanism, integrate with it instead of duplicating it.

---

# 2. Same-target safety

Comparison should primarily be used for scans of the same target.

Inspect the existing comparison domain rules first.

If the current comparison system already supports arbitrary targets, preserve that behavior.

If it requires same-target scans, enforce that constraint in the UI and explain it clearly.

Do NOT invent a new comparison policy.

Important:

Do not silently replace one selected scan with another.

Do not silently discard an invalid selection.

---

# 3. URL-driven comparison

The selected scan IDs should be represented in the URL if the existing comparison architecture supports query parameters.

Prefer a deterministic URL such as:

`/scans/compare?left=<id>&right=<id>`

or the repository's existing equivalent.

Requirements:

- refresh must preserve the comparison;
- direct navigation must work;
- back/forward navigation must remain understandable;
- IDs must be safely encoded;
- invalid IDs must produce an explicit empty/error state, not a crash.

Do not introduce client-only global state.

---

# 4. Comparison page

Reuse the existing comparison page.

Only improve it where required for the new history flow.

At minimum the user must be able to identify:

- left scan target;
- right scan target;
- scan dates/times;
- scan status;
- which scan is older/newer when applicable.

If the existing comparison already displays these, do not duplicate them.

---

# 5. Useful result differences

Inspect what comparison already computes.

Preserve existing comparison semantics.

If already available, make sure the UI clearly exposes:

- technologies present in both scans;
- technologies added;
- technologies removed;
- meaningful score/detection changes.

Do NOT create a new diff algorithm in this step.

If the comparison domain does not yet support one of these concepts, document it rather than expanding scope.

---

# 6. Selection behavior

Implement deterministic selection rules.

Recommended behavior:

- 0 selected → comparison action disabled;
- 1 selected → comparison action remains disabled and explains that a second scan is required;
- 2 selected → comparison action enabled;
- >2 selected → either prevent selection or follow the existing comparison contract.

Do not invent a multi-scan comparison mode.

If two scans are selected and the application already has a canonical ordering, preserve the user's explicit left/right selection if possible.

---

# 7. Accessibility

The selection UI must support:

- keyboard interaction;
- visible `:focus-visible`;
- semantic buttons/checkboxes/controls;
- accessible names;
- selected state exposed to assistive technology where applicable.

Do not use color alone to communicate selection.

---

# 8. Tests

Add focused tests for the implemented behavior.

At minimum cover:

### History selection

1. zero selected scans;
2. one selected scan;
3. two selected scans;
4. duplicate selection prevented;
5. selected state rendered correctly;
6. compare action enabled only when valid.

### Navigation

7. selected IDs produce the expected comparison URL;
8. refresh/direct navigation preserves selection;
9. invalid scan ID is handled safely;
10. missing scan ID is handled safely.

### Same-target behavior

11. same-target scans can be compared;
12. different-target behavior matches the existing comparison contract.

### Regression

13. Re-scan link from Step 56 still works;
14. `N scans` context from Step 57 remains correct;
15. existing comparison tests remain valid.

Do not add tests for behavior the product does not actually implement.

---

# 9. Scope

## IN SCOPE

- connecting scan history to existing comparison;
- explicit two-scan selection;
- URL-driven comparison state;
- selection accessibility;
- invalid-state handling;
- focused tests.

## OUT OF SCOPE

- new database tables;
- new comparison engine;
- historical analytics;
- charts;
- automatic comparison;
- multi-scan comparison;
- scheduled scans;
- notifications;
- authentication;
- scan deletion;
- scan engine changes;
- crawler/detector changes;
- redesign of the entire `/scans/compare` page.

Do not proceed to the next step automatically.

---

# Validation

Run:

1. focused comparison/history tests;
2. full Vitest;
3. TypeScript;
4. ESLint;
5. Prettier;
6. `next build`;
7. madge/circular dependency check.

No regressions are acceptable.

---

# Final report

Return:

1. STATUS
2. Commit
3. Step 0 findings
4. Existing comparison architecture
5. Files changed
6. Selection implementation
7. URL/query-param implementation
8. Same-target behavior
9. Invalid-state handling
10. Accessibility changes
11. Tests added
12. Full validation results
13. Explicit confirmation that Step 56 Re-scan and Step 57 scan-history behavior remain intact
14. Any architectural issue discovered
15. Scope confirmation

Do not implement the next step automatically.