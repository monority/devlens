# Step 81 — Detection Result Integrity: Final QA Report

This is the §24 Final QA report for **Step 81 — Detection Result Integrity**,
the last step of the documentation sequence. It completes the step by
recording what was actually implemented, the invariants that were enforced,
and the real validation results obtained from the repository.

See `docs/Step81.md` for the step specification (goal, scope, architecture,
domain model, invariants, and implementation workflow).

---

## Context

Step 81 introduces a pure, deterministic, structural validator over a
finalized `Detection`:

```ts
computeDetectionIntegrity(detection, provenance?): DetectionIntegrity
```

It builds on the two preceding result layers:

- **Step 79** — scan-level result quality (`scan-result-quality.ts`).
- **Step 80** — per-detection provenance (`detection-provenance.ts`).

Step 81 guarantees that the final detection result is **internally
consistent** — i.e. a detection, its evidence, and its provenance never
contradict one another. It is a **validator / derived diagnostic**, not a
detector, not a scorer, and not a deduplication pipeline. Per Step 81 §3, it
sits in the result pipeline _after_ provenance and _before_ the API/UI:

```text
final Detection[]
  → quality (Step 79)
  → provenance (Step 80)
  → Result Integrity (Step 81)   ← this module
  → API / diagnostics
```

---

## §24 Final QA Report

### Implementation

**Files added (Step 81):**

| File                                                   | Purpose                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/domain/detection-integrity.ts`      | `computeDetectionIntegrity`, `DetectionIntegrity`, `DetectionIntegrityIssue`, `INTEGRITY_ISSUE_ORDER`. A pure O(n) read over the finalized detection's technology identity, evidence, `source`, and attached provenance. Reuses Step 80's `computeDetectionProvenance` to verify provenance consistency (§5.5). Never mutates the input; never performs IO. |
| `packages/core/src/domain/detection-integrity.test.ts` | 33 pure-domain unit tests (no React/HTTP/DB/browser).                                                                                                                                                                                                                                                                                                       |

**Files modified (Step 81):**

| File                                             | Change                                                                                                                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/index.ts`                     | Re-exports the integrity module from the public `@devlens/core` API.                                                                                                                                                 |
| `apps/web/src/lib/types.ts`                      | Imports `DetectionIntegrity` from `@devlens/core`; adds `integrity?: DetectionIntegrity` to `DetectionResponse` (absent when the detection is valid).                                                                |
| `apps/web/src/lib/detection-to-response.ts`      | In `detectionToResponse`, computes `computeDetectionIntegrity(detection, provenance)` and attaches `integrity` to the response **only when `valid === false`** (no API noise for clean detections, per Step 81 §10). |
| `apps/web/src/lib/detection-to-response.test.ts` | Adds a "Step 81 integrity" test block (6 tests) covering the mapping-level contract: omitted for valid detections, surfaced on duplicate evidence, canonical ordering, determinism, and no-mutation.                 |
| `docs/architecture/domain-model.md`              | §21 architecture update: documents the final semantic result pipeline and per-layer ownership; updates the domain file-structure listing to include the Step 78–81 modules.                                          |
| `docs/Step81-report.md`                          | This report.                                                                                                                                                                                                         |

> **Note on prerequisites.** Step 81's validator _reuses_ Step 80's
> `computeDetectionProvenance` (per Step 81 §5.5: "Import and reuse the
> existing provenance computation"). The provenance computation (`detection-provenance.ts`)
> and the observation-coverage / scan-quality layers (Steps 78–80) are
> prerequisites shipped as their own steps; they are not part of Step 81's
> diff, but Step 81's cross-checks depend on them.

**Exact architecture change:**

A new pure domain module — `detection-integrity` inside `@devlens/core` — is
projected in the result pipeline _after_ provenance (Step 80) and _before_
the API/UI response mapping. It reads an already-finalized `Detection`
(post-dedup, post-score) together with its optionally-attached provenance and
emits a canonical `DetectionIntegrity` verdict. The finalized detection
remains the single source of truth; no upstream layer (deduplication, scoring,
detectors, crawler, resource acquisition) is modified.

**Whether the public API changed:**

Yes — **minimal and backward-compatible** (Step 81 §10). `DetectionResponse`
gains an _optional_ `integrity?: DetectionIntegrity` field that is **absent
for clean detections** (present only when `valid === false`), so the common
case adds no API noise. `@devlens/core` additionally exports
`computeDetectionIntegrity`, `DetectionIntegrity`, `DetectionIntegrityIssue`,
and `INTEGRITY_ISSUE_ORDER`.

**Whether persistence changed:**

None. Integrity is a derived, in-memory diagnostic computed at
response-mapping time; it is never persisted (no new DB column — Step 81
§9/§10, §20).

### Integrity invariants

Every invariant from Step 81 §5/§6/§7/§12 that is implemented and covered by
tests:

| #   | Invariant (§)                                                                                                                                        | Implemented & tested              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | §5.1 Detection identity — `Technology.id` is a non-empty string                                                                                      | ✅ `INVALID_DETECTION_IDENTITY`   |
| 2   | §5.2 Evidence consistency — `provenance.evidenceCount === evidence.length` when provenance is attached                                               | ✅ `PROVENANCE_MISMATCH`          |
| 3   | §5.3 Evidence type consistency — every `provenance.evidenceTypes` entry matches a real evidence `type` (no fabricated/stale/deduplicated-away types) | ✅ `INVALID_EVIDENCE_TYPE`        |
| 4   | §5.4 Duplicate evidence — canonical-identity duplicates _detected_ via the project's existing evidence identity, never removed                       | ✅ `DUPLICATE_EVIDENCE`           |
| 5   | §5.5 Provenance consistency — `evidenceTypes` canonical order + `strongestEvidenceType` re-derivable from the same `detection.evidence`              | ✅ `PROVENANCE_MISMATCH`          |
| 6   | §6 Empty-evidence — invalid for directly-observed detections, **valid** for relationship-derived detections                                          | ✅ `EMPTY_EVIDENCE` (direct only) |
| 7   | §7 Derived-detection distinction — a relationship-derived detection must not carry provenance                                                        | ✅ `PROVENANCE_MISMATCH`          |
| 8   | §8 No mutation — pure read; detection & provenance are unchanged (frozen inputs in tests)                                                            | ✅ tested                         |
| 9   | §9 No new scoring system — no `integrityScore`/`trustScore`/`reliabilityScore`/`qualityScore`                                                        | ✅ none introduced                |
| 10  | §12 Determinism — canonical issue ordering via `INTEGRITY_ISSUE_ORDER`                                                                               | ✅ tested                         |
| 11  | §13 Performance — O(n) over evidence; synchronous; no network/DB/crawler/browser/detector/scorer execution                                           | ✅ pure, no IO                    |

**Issue taxonomy** (`DetectionIntegrityIssue`, Step 81 §4):

```text
INVALID_DETECTION_IDENTITY
INVALID_EVIDENCE_TYPE
DUPLICATE_EVIDENCE
PROVENANCE_MISMATCH
EMPTY_EVIDENCE
```

Canonical ordering (Step 81 §12):

```text
INVALID_DETECTION_IDENTITY → INVALID_EVIDENCE_TYPE → DUPLICATE_EVIDENCE
→ PROVENANCE_MISMATCH → EMPTY_EVIDENCE
```

> **Design note (§5.4).** The integrity layer defines a _local_
> `evidenceIdentity` helper that **mirrors** the existing canonical evidence
> identity used elsewhere in the project (`getEvidenceKey` in
> `@devlens/detectors` and `getEvidenceIdentity` in the web layer). It is
> defined locally in core because the domain layer cannot depend on
> `@devlens/detectors` (detectors depends on core — Step 81 §9). It is used
> **only to report** duplicates; the integrity layer never removes or
> reorders evidence.

### Tests

Exact counts (Step 81 deliverables):

| Suite                   | Location                                               | Tests             |
| ----------------------- | ------------------------------------------------------ | ----------------- |
| Core domain             | `packages/core/src/domain/detection-integrity.test.ts` | **33** (new file) |
| Mapping (Step 81 block) | `apps/web/src/lib/detection-to-response.test.ts`       | **6**             |

**Step 81 test total: 39 new tests**, all passing.

Covered scenarios (Step 81 §14/§15): a valid direct detection with correct
provenance; a valid relationship-derived detection (no evidence, no
provenance); empty-evidence on a direct detection (`EMPTY_EVIDENCE`) vs. a
derived detection (valid); duplicate evidence (canonical identity,
same-name-different-value, single item, cross-type same URL, `resource_content`
identity, URL-casing normalization); provenance count mismatch;
`strongestEvidenceType` mismatch; `evidenceTypes` ordering mismatch;
fabricated/stale evidence types; provenance attached to a derived detection;
invalid/empty/null/non-string technology identity; determinism (identical
output, canonical ordering, plain-serializable object, purity); no-mutation
of detection or provenance; pipeline integration (a normal production
detection is valid; identity/evidence/confidence/ordering/quality/provenance
unchanged).

### Validation

Run from the repository root (Step 81 §23):

| Check                     | Command                                      | Result                                                                        |
| ------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| Typecheck                 | `pnpm typecheck`                             | ✅ PASS (exit 0)                                                              |
| Lint                      | `pnpm exec eslint <touched files>`           | ✅ PASS (exit 0, no warnings)                                                 |
| Formatting                | `pnpm exec prettier --check <touched files>` | ✅ PASS — "All matched files use Prettier code style!"                        |
| Unit + integration tests  | `pnpm exec vitest run` (full suite)          | ✅ PASS — **2344 passed, 18 skipped, 0 failed** (122 files passed, 2 skipped) |
| Build                     | `pnpm build` (`pnpm -r build`)               | ✅ PASS (exit 0; Next.js static pages generated)                              |
| Circular dependency check | `npx madge --circular`                       | ✅ PASS — "No circular dependency found!"                                     |
| E2E / browser             | `pnpm test:e2e`                              | ⚪ Not applicable — see §Browser                                              |

### Browser

Not applicable for ceremony (Step 81 §18). Step 81 introduces **no UI-visible
change**: per Step 81 §17, the integrity verdict is a server-side diagnostic
attached to the API response only when `valid === false`; it is **not**
rendered as a badge or label in the UI ("no issue = no additional UI").
`DetectionItem.tsx` is unchanged by Step 81 (its recent change is the
Step 80 provenance "signals" line). Normal detection cards remain unchanged
for valid results, and no `integrity` UI was added.

The only externally observable surface is the optional `integrity?:
DetectionIntegrity` field on `DetectionResponse` — an additive,
backward-compatible field (absent for clean detections). This is covered by
unit tests (`detection-to-response.test.ts`, Step 81 block). The
end-to-end `route.integration.test.ts` remains skipped (pre-existing — it
requires PostgreSQL), so no browser run was performed.

### Architecture

Explicit confirmation against Step 81 §20 (Forbidden implementations):

```text
No new detector              ✅
No new crawler              ✅
No scorer modification      ✅
No third deduplication      ✅ (duplicate *detection* via mirrored identity; never removes)
No new DB column            ✅
No new network dependency   ✅ (pure domain function, O(n), no IO)
No mutation                 ✅ (frozen-input tests)
No integrity score          ✅ (boolean + issue list only)
```

No AI/LLM, no ML/Bayesian inference, no generic validation framework, and no
response-mapping duplication were introduced. The response mapping has one
canonical path: `detectionToResponse`.

### Commit

**Not yet committed.** The working tree currently bundles the in-progress
work for Steps 78, 80, and 81 (all uncommitted). Per Step 81 §24, Step 81
should land as **one clean, dedicated commit** containing only Step-81
files, excluding docs unrelated to Step 81, build artifacts, generated
files, settings (`.poolside/`), and the stray `head` file. The dedicated
commit is the remaining _code_ step and is out of scope for this
documentation deliverable.

---

## §25 Definition of Done

Step 81 is **PASS** on every check that is in scope for this documentation
deliverable:

| Criterion                                       | Status | Notes                                                                      |
| ----------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Existing domain contracts inspected             | ✅     | `Detection`, `Evidence`, `Technology`, `Confidence`, `DetectionProvenance` |
| Existing validation/identity utilities reused   | ✅     | `evidenceIdentity` mirrors `getEvidenceKey`/`getEvidenceIdentity`          |
| Integrity is a pure derived diagnostic          | ✅     | `computeDetectionIntegrity` — pure read                                    |
| Finalized detection remains the source of truth | ✅     | validator only observes                                                    |
| Evidence is never mutated                       | ✅     | frozen-input tests                                                         |
| No third deduplication implementation           | ✅     | reports only; never removes                                                |
| Provenance consistency verified                 | ✅     | §5.2/§5.3/§5.5                                                             |
| Evidence identity consistency verified          | ✅     | §5.4                                                                       |
| Issue ordering is deterministic                 | ✅     | `INTEGRITY_ISSUE_ORDER`                                                    |
| No integrity score                              | ✅     | boolean + issue list                                                       |
| Scoring behavior unchanged                      | ✅     | untouched                                                                  |
| Detection identity unchanged                    | ✅     | untouched                                                                  |
| Scan quality unchanged                          | ✅     | untouched                                                                  |
| Derived-detection behavior unchanged            | ✅     | untouched                                                                  |
| API changes minimal & intentional               | ✅     | optional `integrity`, absent when valid                                    |
| Unit tests pass                                 | ✅     | 33 core + 6 mapping                                                        |
| Integration/regression tests pass               | ✅     | full suite 2344 passed                                                     |
| Typecheck passes                                | ✅     | exit 0                                                                     |
| Lint passes                                     | ✅     | exit 0, no warnings                                                        |
| Formatting passes                               | ✅     | prettier clean                                                             |
| Build passes                                    | ✅     | exit 0                                                                     |
| Circular dependency check passes                | ✅     | none found                                                                 |
| Browser/E2E validation                          | ⚪     | N/A — no UI change (additive optional API field only)                      |
| Final diff contains only intended changes       | ✅     | pending dedicated Step-81 commit                                           |
| Clean dedicated commit created                  | ⚪     | not yet (code step)                                                        |
| Final QA report produced                        | ✅     | this document                                                              |

**Verdict: PASS** — modulo the remaining dedicated Step 81 commit, which is a
code step outside this documentation deliverable.

---

## §26 Guiding principle

> Step 79 — Make the result better.
> Step 80 — Make the result explainable.
> Step 81 — Make the result internally consistent.

No new scoring. No new sources of truth. The finalized detection, its
evidence, and its provenance remain the only grounds; integrity only
**reports** when they disagree.
