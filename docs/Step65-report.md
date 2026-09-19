# Step 65 — Detection Intelligence & Explainability

**Commit:** `Step 65: Detection Intelligence & Explainability`
**Start:** green tree at `59e2d49` (`1765 passed | 18 skipped`).
**End:** `1766 passed | 18 skipped` — 0 new failures.
**Scope policy (§STRATEGIC CHANGE):** NO detector-engine changes, NO new detection features, NO AI/invented explanations. Work is additive to the existing web presentation layer only, improving it where a real usability/defect exists.

## Executive summary

The detection and explainability backbone was already strong (inherited from Steps 62–64): deterministic ranking (confidence DESC, technology.id ASC), evidence dedup by canonical key sorted ASC, faithful explainability (`detection-explainability.ts`), accessible `<details>`-based evidence disclosure, and honest empty/error states. The single genuine, spec-pointed defect was **confidence being rendered as a percentage** (`95%`) in four UI sites, which falsely implies probability — explicitly forbidden by §P4. This step fixes that defect and tightens the zero-detection wording (§P7). No detector, database, or core code was modified.

## What changed (by phase)

### Phase 4 — Confidence semantics (the defect)

**Problem.** `Detection.confidence` is a 0–100 *internal deterministic ranking score* (see `packages/core/src/domain/value-objects.ts`), not a probability. Appending `%` framed it as one. §P4: "Do NOT falsely represent it as probability … Prefer: `Confidence 95`."

Four render sites appended `%`:
| File | Line | Before | After |
|------|------|--------|-------|
| `apps/web/src/components/DetectionItem.tsx` | 54 | `Confidence: {confidence}%` | `Confidence: {confidence}` |
| `apps/web/src/components/ScanOverview.tsx` | 149 | `${overview.highestConfidence}%` | `{overview.highestConfidence}` |
| `apps/web/src/components/ScanComparison.tsx` | 334 | `Confidence: {detection.rightConfidence}%` | `Confidence: {detection.rightConfidence}` |
| `apps/web/src/components/ScanComparison.tsx` | 337 | `Confidence: {detection.leftConfidence}%` | `Confidence: {detection.leftConfidence}` |

The doc comment in `ScanOverview.tsx` (`95% Highest confidence`) and the `DetectionItem.tsx` layout comment (`Confidence: N%`) were updated to match.

**Tests.** Six existing assertions *hard-coded the bug* (`expect(...).toContain('Confidence: 80%')`, etc.) in `ScanComparison.test.tsx` (6 sites), `ScanOverview.test.tsx` (2 sites), and `ScanViews.test.tsx` (3 sites). All were updated to assert the value without `%` **and** to add a regression assertion `expect(...).not.toContain('...%')`. Two new regression tests were added:
- `DetectionItem.test.tsx` — `never renders confidence as a probability (no "%" suffix)`.
- `ScanOverview.test.tsx` / `ScanViews.test.tsx` / `ScanComparison.test.tsx` — extended the existing "renders confidence value exactly" / overview tests with `not.toContain('95%')` / `not.toContain('Confidence: N%')`.

After the fix, a repo-wide grep confirms **zero** `}%`-confidence renderings remain in the web UI.

**Note (not a bug).** `ScanComparison.tsx:343` renders the score *delta* `leftConfidence → rightConfidence` (raw numbers, no `%`) — this is a rank delta, not a probability, and is left as-is per §P11.

### Phase 7 — Empty / zero-detection wording

`EmptyDetections.tsx` (rendered only for *completed* scans with zero detections) previously said only "No supported technologies were detected on this site," which a reader could misread as "the site has no technology." Added a neutral clarifying sentence (§P7):

> This does not mean the site uses no technologies — DevLens can only detect technology from the observable HTTP, HTML, and script signatures it inspects. A known technology that leaves no observable signature will not appear here.

**Test.** Extended `DetectionList.test.tsx` ("renders empty state for zero detections") to assert the new wording (`does not mean the site uses no technologies`, `observable`) and to guard against a technology-free claim (`not.toContain('no technologies were detected on this site')`).

**Step-62 regression already in place.** The "failed scan → completed successfully" wording bug from Step 62 is already guarded: `ScanViews.tsx` only mounts `EmptyDetections` for completed-zero scans, and the `failed` branch shows "Detection results are not available because the scan failed." (`ScanViews.test.tsx:404` — `does not show "scan completed successfully" for failed scans` — still passes.)

## Phase audit (no further changes)

- **Phase 2 (detection summary):** already covered — `ScanOverview` (technology count, evidence total, highest confidence, target, hostname, timeline) + `ScanInsights` (category composition, evidence source-type breakdown, technology list with catalog links, per-tech evidence matrix).
- **Phase 3 (result cards):** all 7 required fields verified present in `DetectionItem.tsx` — technology name (+ catalog link for known IDs), category, confidence, evidence count, evidence types/sources, expandable evidence `<details>` tree (`EvidenceList`/`EvidenceItem`). The confidence `%` was the only defect; fixed.
- **Phase 5 (evidence quality):** already satisfied — `EvidenceItem` wraps long values with `title=`, `<code>` for snippets/selectors, `<a>` (with `rel="noopener noreferrer"`) for URLs; `EvidenceList` uses accessible `<details>/<summary>` (no JS). `EvidenceItem.test.tsx` already covers long-value `title` + all 8 evidence types. No changes.
- **Phase 6 (category intelligence):** already grouped by existing categories in `ScanInsights` (`categoryComposition`, `categoryList`). No changes.
- **Phase 8 (technology detail):** `technologies/[id]/page.tsx` + `lib/technology-catalog.ts` consistent — descriptions are neutral/factual (e.g. "Open-source content management system"), metadata derived only from the catalog, no invented accuracy. No changes.
- **Phase 9 (comparison):** `ScanComparison.tsx` reuses `ScanOverview` (now `%` fixed) and `getScanOverview`. No probability wording (`probability`/`likely`/`definitely`/etc. grep returns nothing in components). Deltas are rank deltas. No changes beyond the Phase 4 fix.
- **Phase 10 (real user flow):** scan detail page (`scans/[id]`) wiring intact — completed → overview+insights+coverage+detections; failed → "not available" message; pending/running → `ScanningState`. Zero-detection → `EmptyDetections`. No changes.
- **Phase 11 (no fake intelligence):** no AI explanations, no probability wording, no invented accuracy, no arbitrary importance ranking. Confidence is passed through exactly (per `detection-explainability.ts` JSDoc: "never recalculated"). No changes.
- **Phase 12 (real issues):** the confidence `%` and the weak zero-detection wording are the two real issues fixed. No speculative issues filed.
- **Phase 13 (self-audit):** `madge` is not a project dependency (not in `root package.json`, not in `node_modules/.bin`). Manual cycle review: all edits are text/assertion changes with **no new import edges**, so no new cycles possible. Skipped per project precedent.

## Validation gate (§P14) — all green

| Gate | Command | Result |
|------|---------|--------|
| Focused tests | `vitest run` (5 affected suites) | 151 passed |
| Full suite | `vitest run` (whole monorepo) | **100 files passed · 2 skipped · 1766 passed · 18 skipped** (was 1765; +1 regression test) |
| Typecheck | `pnpm typecheck` (11 projects) | exit 0, all `Done` |
| Lint | `eslint .` | exit 0 |
| Format | `prettier --check` (changed files) | All matched files use Prettier code style |
| Build | `pnpm build` (`pnpm -r build`, Next 15.5.24) | Done — `Compiled successfully`, 9/9 static pages |
| Cycle check | `madge` | not installed → manual review (no new import edges) |

PostgreSQL is unavailable (`DATABASE_URL` unset), so `postgres-repository.test.ts` (16 tests) and `route.integration.test.ts` (2 tests) remain `describe.skip` — same as the Step 64 baseline. The always-on `snapshot-mapping.test.ts` (3 tests) continues to pass without a DB.

## Files changed (9)

```
apps/web/src/components/DetectionItem.tsx          (+2/-2)
apps/web/src/components/DetectionItem.test.tsx   (+11/-0)  new regression test
apps/web/src/components/ScanOverview.tsx          (+2/-2)
apps/web/src/components/ScanOverview.test.tsx    (+6/-2)
apps/web/src/components/ScanComparison.tsx        (+2/-2)
apps/web/src/components/ScanComparison.test.tsx  (+14/-6)
apps/web/src/components/ScanViews.test.tsx        (+9/-3)
apps/web/src/components/EmptyDetections.tsx       (+6/-0)
apps/web/src/components/DetectionList.test.tsx    (+5/-2)
```

Plus `docs/Step65.Md` (spec, committed alongside per repo convention) and this report (`docs/Step65-report.md`). `.poolside/settings.local.yaml` was deliberately **not** staged.
