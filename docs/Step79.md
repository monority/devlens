You are working on the DevLens monorepo.

## Step 79 — Scan Intelligence & Result Quality

### Mission

Build the next **real product-level intelligence layer** on top of the existing detection, explainability, signal-quality, comparison, and observation-coverage systems.

The goal is to give a scan a concise, factual answer to:

> **How interpretable and complete are these detection results?**

This is NOT a new detector and NOT a new scoring algorithm.

DevLens already has:

* detection confidence
* evidence
* signal quality
* direct vs derived provenance
* versions and version conflicts
* explanation/reasons
* observation coverage
* failed/skipped observation tracking

Step 79 should aggregate those existing facts into a deterministic **scan-level result-quality model** and expose it in the UI.

---

# 1. Hard constraints

Do NOT modify:

* crawler behavior
* resource acquisition
* detector implementations
* detector signatures
* confidence scoring
* deduplication
* relationship resolution
* version extraction/consensus
* catalog definitions
* comparison algorithms
* database schema
* persistence format

Do NOT introduce:

* probabilistic claims
* percentages representing probability
* invented confidence
* "accuracy" claims
* "complete scan" claims when coverage is partial
* a single opaque score such as `87/100`
* ranking of technologies

The result-quality layer must remain **descriptive**, not predictive.

Do not duplicate logic that already exists.

Reuse:

* `getObservationCoverage`
* `computeSignalQuality`
* detection explainability
* detection presentation helpers
* existing comparison/presentation infrastructure

---

# 2. Product model

Introduce a pure model representing scan-level result quality.

Suggested location:

`packages/core/src/domain/scan-result-quality.ts`

Use a factual categorical model, for example:

```ts
export type ScanResultQuality =
  | 'well_supported'
  | 'partially_observed'
  | 'limited_observation'
  | 'no_observations';
```

Do NOT blindly copy these names if the existing domain vocabulary suggests better names.

The model must expose the underlying facts rather than hiding them behind a single label.

Suggested shape:

```ts
export interface ScanResultQualitySummary {
  quality: ScanResultQuality;

  detectionCount: number;
  directDetectionCount: number;
  derivedDetectionCount: number;

  corroboratedDetectionCount: number;
  singleSignalDetectionCount: number;
  noEvidenceDetectionCount: number;

  versionConflictCount: number;

  failedObservationCount: number;
  skippedObservationCount: number;

  hasPartialObservation: boolean;
}
```

Adjust the exact shape after inspecting the existing domain types.

Important:

**Do not manufacture ratios unless there is a concrete product reason for them.**

Counts and categorical state are sufficient.

---

# 3. Derivation rules

The derivation must be:

* pure
* deterministic
* O(n)
* order-independent
* based only on existing facts

Use existing `DetectionExplainability.signalQuality` when available rather than recomputing signal quality.

Use the existing provenance fields to distinguish:

* direct detections
* relationship-derived detections

Use existing version conflict information.

Use Step 78 observation coverage to determine whether the scan was partially observed.

Suggested semantic rules:

### `no_observations`

No usable observation was available and no detections exist.

### `limited_observation`

The scan has very little usable observational coverage, or substantial observation failure/skipping makes interpretation materially limited.

### `partially_observed`

There are usable observations/detections, but some observation surfaces failed or were skipped.

### `well_supported`

The scan has usable observations without material observation failures/skips, and its detections are supported by the available evidence.

Do NOT turn "well_supported" into "high accuracy".

This is about **observability and evidence quality**, not truth probability.

Inspect the real data model before finalizing these rules. If a cleaner factual taxonomy is warranted, use it.

---

# 4. Important semantic distinction

Do NOT confuse:

* observation coverage
* detection evidence quality
* detection confidence
* scan result quality

They answer different questions.

For example:

A scan can have:

```text
excellent observation coverage
+
one weak single-signal detection
```

That does not mean the scan itself was poorly observed.

Likewise:

```text
partial observation coverage
+
strong corroborated detections
```

should remain visibly partial rather than being upgraded to "complete".

The summary must preserve these dimensions instead of collapsing everything into one score.

---

# 5. API

Expose the new aggregate at the scan level.

Prefer:

```ts
ScanDetailResponse.resultQuality?: ScanResultQualitySummary
```

and, if the existing create response genuinely exposes the same complete scan representation:

```ts
CreateScanResponse.resultQuality?: ScanResultQualitySummary
```

Inspect the actual response architecture before changing both.

Do NOT put this on:

* `DetectionResponse`
* `DetectionExplainability`

It describes the scan, not an individual detection.

Compute it server-side from the real domain data.

Keep the field optional if that is consistent with the existing API's forward-compatibility conventions.

---

# 6. UI

Add a compact scan-level section near the existing:

* `ScanOverview`
* `ObservationCoverageSummary`
* detection results

Do not create a giant dashboard card.

Suggested component:

`ObservationQualitySummary.tsx`

or another name that fits the existing naming conventions.

It should communicate:

### Overall interpretation

Examples:

* `Well supported`
* `Partially observed`
* `Limited observation`
* `No observations`

Then show compact factual details such as:

```text
12 detections
9 direct · 3 derived
7 corroborated · 5 single-signal
1 version conflict
2 failed observations
```

Only show dimensions that actually exist / are relevant.

Do not use:

* percentages
* stars
* grades
* arbitrary numerical score
* green "trusted" language
* red "bad scan" language

The UI should be calm and factual.

---

# 7. Interaction with Step 78

The two summaries must complement each other.

Step 78 answers:

> **What parts of the site were observable?**

Step 79 answers:

> **What does that mean for interpreting the resulting detections?**

Do not duplicate the entire observation matrix.

For example:

```text
Observation coverage
Headers      observed
Meta         observed
Resources    partial
...

Result quality
Partially observed

12 detections · 8 direct · 4 derived
7 corroborated · 5 single-signal
1 version conflict

Some observations could not be inspected, so results may be incomplete.
```

Reuse existing Step 78 warning semantics rather than inventing another warning system.

---

# 8. Empty scans

Integrate with the existing `EmptyDetections` behavior.

Examples:

### No detections + no observations

Keep:

> No observable technologies were detected.

But the result-quality context should make clear that there was nothing observable to support a detection.

### No detections + partial/failed/skipped observations

Keep the Step 78 wording:

> No observable technologies were detected.

and its existing incomplete-observation warning.

Do NOT imply:

> The site has no technologies.

---

# 9. Tests

Add focused tests for the pure domain function.

At minimum cover:

### A — fully observed scan

* detections
* direct + derived
* multiple signal-quality levels
* no failed/skipped observations

### B — partially observed scan

* successful observations
* failed resources
* result classified as partial/limited according to the finalized rules

### C — skipped-only observations

Ensure skipped is not silently interpreted as failed.

### D — failed-only observations

Ensure failed remains distinguishable.

### E — no detections

Correct zero counts.

### F — version conflicts

Count existing version conflicts without inventing additional ones.

### G — derived detections

Correctly distinguish direct vs relationship-derived detections.

### H — deterministic ordering

Permuting detections/resources must not change the summary.

### I — signal quality

Reuse the existing explainability signal quality rather than reconstructing evidence-family logic.

### J — regression

Existing detection confidence, signal quality, observation coverage, comparison, and explainability tests remain unchanged.

Add API tests for the new top-level field.

Add UI tests for:

* well-supported state
* partial state
* limited/no-observation state
* counts
* version conflict visibility
* interaction with existing observation-coverage warning
* empty-detection rendering

---

# 10. Architecture audit before implementation

Before editing, inspect:

* `packages/core/src/domain/detection.ts`
* `packages/core/src/domain/observation-coverage.ts`
* Step 76 signal-quality implementation
* Step 73 explainability model/builders
* Step 77 detection-presentation
* current `ScanDetailResponse`
* `handler.ts`
* `ScanViews`
* `ScanOverview`
* `ObservationCoverageSummary`
* `EmptyDetections`
* existing tests around all of the above

Identify the smallest clean integration point.

Do not create duplicate representations of existing facts.

---

# 11. Self-audit

After implementation, perform a focused self-audit:

### Semantics

* Does the quality model describe observability/evidence rather than probability?
* Are failed and skipped still distinguishable?
* Is partial coverage still visible?
* Can "well supported" be misread as "correct"? If so, rename it.

### Architecture

* Is all derivation pure?
* Is it deterministic?
* Is it O(n)?
* Is existing signal-quality logic reused?
* Is there any duplicated coverage logic?
* Did any detector/crawler/scorer behavior change?

### UI

* Is the result understandable without opening raw evidence?
* Does it avoid arbitrary scores?
* Does it avoid claiming absence of technologies?
* Does it complement Step 78 instead of duplicating it?

Fix any real issues found.

---

# 12. Validation

Run:

```bash
pnpm typecheck
pnpm exec eslint .
pnpm exec prettier --check <all touched files>
pnpm exec vitest run
pnpm build
```

All must pass.

Do not weaken existing tests.

---

# 13. Scope discipline

Keep the change focused.

Do not:

* add unrelated catalog technologies
* improve detectors
* redesign the dashboard
* refactor unrelated components
* add browser/E2E infrastructure
* add database migrations
* modify resource acquisition
* create documentation-only work

If an existing abstraction is genuinely insufficient, make the smallest necessary change and explain it in the final report.

---

# 14. Git

Inspect the diff carefully.

Never use:

```bash
git add -A
```

Do not commit:

* `.poolside/`
* `settings.local.yaml`
* `.env*`
* secrets
* scratch files
* runtime artifacts
* unrelated pre-existing modifications

Commit only the Step 79 files.

Commit message exactly:

```text
Step 79: Scan Intelligence & Result Quality
```

---

# 15. Final report

Return:

1. Verdict: PASS/FAIL
2. Commit hash
3. Files changed
4. Final result-quality taxonomy
5. Derivation rules
6. API changes
7. UI changes
8. Tests added
9. Validation results
10. Self-audit findings and fixes
11. Explicit confirmation that detectors, scoring, relationships, versions, crawler, and resource acquisition were not behaviorally changed
12. Any remaining limitations

Do not start another step automatically.
