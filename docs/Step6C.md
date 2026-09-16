# Step 6C — CompositeDetector: Composing Multiple Detectors

## Task

Continue DevLens from the completed Step 6B state.

Step 6B is COMPLETE.

Current state:

- Detector abstraction exists in `@devlens/detectors`
- `HeaderDetector` is the first concrete detector
- `HeaderDetector` is wired into web and worker
- `ScanResult` already persists detections
- `Detection` includes evidence and confidence
- The application layer only depends on the `Detector` abstraction

Step 6B validation:

- `pnpm lint` ✅
- `pnpm typecheck` ✅ 10/10 projects
- `pnpm test` ✅ 167 passed, 9 skipped
- `pnpm build` ✅ 10/10 projects
- `madge --circular` ✅
- PostgreSQL integration tests ✅ 9/9

---

## Final Report

### 1. Objective

Introduce a `CompositeDetector` that composes multiple `Detector`
implementations while preserving the existing `Detector` contract.

### 2. Existing contracts inspected

**Detector interface** (`packages/detectors/src/detector.ts`):

```typescript
interface Detector {
  detect(snapshot: SiteSnapshot): Detection[];
}
```

**Detection** (from `@devlens/core`):

```typescript
interface Detection {
  readonly technology: Technology;
  readonly confidence: Confidence;
  readonly evidence: ReadonlyArray<Evidence>;
}
```

`Detection` has **no unique identity field** — no `id`, no `equals()`
method. Each detection is a standalone record of { technology, confidence,
evidence }. Two detections for the same `technology.id` with different
evidence or confidence are legitimately distinct.

**runScan** (`packages/application/src/orchestrator.ts`):

```typescript
try {
  const snapshot = await crawler.crawl(runningScan.target);
  const detections = detector.detect(snapshot);
  return { scan: completedScan, snapshot, detections };
} catch (error) {
  const scanError: ScanError = toScanError(error);
  const failedScan = failScan(runningScan, scanError, timestamp);
  return { scan: failedScan, snapshot: null, detections: [] };
}
```

If `detector.detect()` throws, the entire scan fails — the error is
translated to `ScanError{ code: 'UNKNOWN_ERROR' }`, the snapshot is lost,
and all detections are discarded.

**executeScan**: unchanged by this step.

**HTTP API**: unchanged — `HandleCreateScanOptions` still has
`detector: Detector`, `CreateScanResponse` still has `detections`.

### 3. CompositeDetector design

`CompositeDetector` is a class that implements `Detector`:

```typescript
class CompositeDetector implements Detector {
  constructor(detectors: readonly Detector[]) {}
  detect(snapshot: SiteSnapshot): Detection[] {}
}
```

**Design**:

- Accepts an ordered `readonly Detector[]` via the constructor.
- Iterates sub-detectors in order, calling `detect(snapshot)` on each
  with the **same** `SiteSnapshot` reference (no copy, no mutation).
- Concatenates results into a flat array using `detections.push(...results)`.
- Returns the aggregated array.
- Introduces no new abstractions — just one class and one method.

### 4. Error policy

**Policy: propagate immediately.** If any sub-detector throws, the
`CompositeDetector` propagates the error immediately without catching it
or running subsequent detectors.

**Rationale**: The existing architecture does NOT establish detectors as
best-effort. `runScan`'s catch block translates any `detector.detect()`
failure into `ScanError{ code: 'UNKNOWN_ERROR' }`, marking the entire
scan as failed. This means a single detector failure already fails the
scan under the current `HeaderDetector` wiring. `CompositeDetector`
preserves this behavior — it is the smallest predictable behavior
consistent with the existing convention.

**Not introduced**: No new error abstraction (no `CompositeDetectorError`,
no `AggregateError`). Raw errors from sub-detectors propagate unchanged.

### 5. Deduplication policy

**Policy: no deduplication.** The `CompositeDetector` does NOT deduplicate
across sub-detectors.

**Rationale**: The domain model (`Detection`) does not define a unique
identity field. There is no `detectionId`, no `equals()` method, and no
equality contract. Two detections with the same `technology.id` but
different evidence or confidence are legitimately distinct (e.g. nginx
detected from a `Server` header vs. nginx detected from an HTML comment).
The `CompositeDetector` does not introduce its own deduplication identity —
that would be inventing a policy not established by the domain.

Individual sub-detectors are responsible for their own internal
deduplication (e.g. `HeaderDetector` deduplicates by technology ID within
itself using a `Set<string>`).

### 6. Files created/modified

#### Created

| File                                                | Purpose                   |
| --------------------------------------------------- | ------------------------- |
| `packages/detectors/src/composite-detector.ts`      | `CompositeDetector` class |
| `packages/detectors/src/composite-detector.test.ts` | 19 unit tests             |

#### Modified

| File                                                   | Change                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `packages/detectors/src/index.ts`                      | Re-exports `CompositeDetector`                                            |
| `packages/application/src/index.ts`                    | Re-exports `CompositeDetector` from `@devlens/detectors`                  |
| `apps/web/src/app/api/scans/route.ts`                  | `new HeaderDetector()` → `new CompositeDetector([new HeaderDetector()])`  |
| `apps/worker/src/main.ts`                              | `new HeaderDetector()` → `new CompositeDetector([new HeaderDetector()])`  |
| `apps/web/src/app/api/scans/route.integration.test.ts` | Integration tests use `CompositeDetector`                                 |
| `docs/architecture/detectors.md`                       | Documents CompositeDetector (composition, ordering, error, deduplication) |
| `docs/architecture/overview.md`                        | Updated detector boundary + worker boundary references                    |

### 7. Tests added

**19 tests** in `packages/detectors/src/composite-detector.test.ts`:

| Category            | Tests | What                                                                                                                                                |
| ------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero detectors      | 1     | Returns `[]` when no sub-detectors                                                                                                                  |
| One detector        | 2     | Returns same results as single detector; returns `[]` for `NullDetector`                                                                            |
| Multiple detectors  | 1     | Aggregates results from 2 detectors                                                                                                                 |
| Ordering            | 2     | Detector order preserved; reversed order preserved                                                                                                  |
| Same snapshot       | 2     | Same reference passed to all; no mutation verified with 2 `HeaderDetector`s                                                                         |
| Empty results       | 2     | All empty → `[]`; interleaved null/empty/non-empty                                                                                                  |
| Multiple detections | 1     | 3 detections from 2 detectors (2+1)                                                                                                                 |
| Deduplication       | 2     | Does NOT dedupe same detection from 2 detectors; does NOT dedupe same technology from different evidence                                            |
| Error behavior      | 4     | Throws on failing sub-detector; stops before subsequent detectors; preserves error type; propagates error from later detector after earlier success |
| Real HeaderDetector | 2     | Composes `HeaderDetector` + mock; composes two `HeaderDetector`s without crash                                                                      |

All tests use test doubles (mock `Detector` implementations) — no network,
no database, no `MetaTagDetector` or `ScriptUrlDetector`.

**2 additional tests** in other suites:

- `apps/web/src/app/api/scans/route.test.ts`: "returns CompositeDetector in the response" (updated existing test)
- `packages/application/src/orchestrator.test.ts`: "runs the detector on the snapshot and includes detections in the result" (existing, unchanged)

### 8. Validation results

```
pnpm lint   ✅  (ESLint + Prettier clean)
pnpm typecheck ✅  (10/10 projects)
pnpm test   ✅  186 passed | 9 skipped (195 total)
pnpm build  ✅  (10/10 projects)
madge --circular ✅  No circular dependency found! (73 files processed)

Integration tests (PostgreSQL 16.4, port 5433):
  packages/database/src/postgres-repository.test.ts: 7/7 ✅
  apps/web/src/app/api/scans/route.integration.test.ts: 2/2 ✅
```

### 9. Remaining detector architecture gaps

1. **MetaTagDetector** — detect from `<meta name="generator">` tags (WordPress,
   Hugo, Jekyll). Would produce `MetaTagEvidence`.
2. **ScriptUrlDetector** — detect from `<script src="...">` URLs (React,
   Vue, jQuery bundles). Would produce `ScriptUrlEvidence`.
3. **ResourceDetector** — detect from loaded resource URLs (CDN patterns).
4. **JavaScriptGlobalDetector** — detect from `window.__technicalIndicators__`
   globals. Would produce `JavaScriptGlobalEvidence`.
5. These five evidence types are defined in `@devlens/core`'s `Evidence`
   union but **only `http_header` is supported** by `HeaderDetector`.
   The other four evidence types remain unutilized.
6. **Confidence escalation**: There is no mechanism to increase confidence
   when multiple evidence sources agree on the same technology (e.g.
   `HeaderDetector` detects nginx AND `HtmlEvidence` also shows nginx).

### 10. Recommended next step

Implement **`MetaTagDetector`** — detects technologies from
`<meta name="generator">` content. This is the next simplest detector
after `HeaderDetector`:

- Inspects `SiteSnapshot.html` (or the HTML string for meta tags)
- Matches `generator` meta tag values against known signatures
- Produces `MetaTagEvidence` with `{ type: 'meta_tag', name: 'generator', content: ... }`
- Wire it into the `CompositeDetector` alongside `HeaderDetector`

```typescript
new CompositeDetector([new HeaderDetector(), new MetaTagDetector()]);
```
