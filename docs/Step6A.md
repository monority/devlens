# Step 6A — Technology Detection Pipeline Wiring

## 1. Objective

Introduce the `Detector` abstraction into `@devlens/detectors` and fully
wire technology detection into the existing scan pipeline, so that the
`Detection`, `Technology`, and `Evidence` domain types defined in
`@devlens/core` are actually exercised end-to-end — from crawl through
persistence and API response.

## 2. Architectural gap identified

After Step 6 (`POST /api/scans`), the pipeline was:

```
POST /api/scans → handler → executeScan → runScan → HttpCrawler.crawl() → SiteSnapshot
                    ↓
              PostgresScanResultRepository.save()
```

The `SiteSnapshot` is crawled but **never analyzed**. The domain model
already defines `Technology` (`TechnologyId`, `name`, `TechnologyCategory`),
`Detection` (`technology + confidence + evidence`), and `Evidence` (a 6-way
discriminated union: `html`, `http_header`, `script_url`, `meta_tag`,
`javascript_global`, `resource`) — all exported from `@devlens/core` — but
these types were **dead code**: never imported, never constructed, never
persisted.

The `@devlens/detectors` package was an empty stub (`export {}`), and
`docs/architecture/application.md` explicitly stated: "Detect technologies
or run analysis" as something the application layer **does not do** — but
nothing existed to do it either.

This is the smallest justified next step because:

- The `Crawler` interface already establishes the pattern: define the
  abstraction in a leaf package, inject it into `runScan`.
- The `Evidence` variants map directly to data already available in
  `SiteSnapshot` (HTTP headers, HTML, resources).
- The database schema already stores JSONB (`headers`, `resources`);
  a `detections` column follows the same pattern.

## 3. Design decision

**Null Object Pattern** — `NullDetector` (`{ detect: () => [] }`) is the
default in the API route and worker. It is a real, tested `Detector`
implementation that returns no detections. This gives us:

- A working abstraction immediately injected into the pipeline
- No speculative concrete detectors (header-based, pattern-based, etc.)
- The `ScanResult.detections` field is always present and testable
- The persistence layer stores detections (empty array for `NullDetector`)

**Dependency direction** — `@devlens/detectors` depends on
`@devlens/core` only (moved from devDependency to dependency).
`@devlens/application` depends on `@devlens/detectors` (added). No
cycles introduced.

**Signature changes** (positional args, no destructuring):

- `runScan(scan, crawler, detector, now?)`
- `executeScan(scan, crawler, detector, repository, now?)`

`detector` is the 3rd positional arg, inserted between `crawler` and
`now`/`repository`. This follows the dependency-injection ordering used
by `runScan` (data source → analysis → persistence).

## 4. Files created/modified

### Created

- `packages/database/drizzle/0001_add_detections_to_snapshots.sql` — migration adding `detections` JSONB column
- `docs/Step6A.md` — this report

### Modified (source)

| File                                           | Change                                                          |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `packages/detectors/src/index.ts`              | Replaced `export {}` with `Detector` interface + `NullDetector` |
| `packages/detectors/package.json`              | `@devlens/core` moved devDep → dep                              |
| `packages/application/package.json`            | Added `@devlens/detectors` dependency                           |
| `packages/application/src/orchestrator.ts`     | `ScanResult.detections`, `runScan` accepts `Detector`           |
| `packages/application/src/execute-scan.ts`     | `executeScan` accepts `Detector`                                |
| `packages/application/src/index.ts`            | Re-exports `Detector` + `NullDetector`                          |
| `packages/database/src/schema.ts`              | Added `detections` column to `snapshots` table                  |
| `packages/database/drizzle/meta/_journal.json` | Added migration journal entry                                   |
| `packages/database/src/postgres-repository.ts` | Persists `detections` in upsert                                 |
| `packages/database/src/repository.ts`          | `InMemoryScanResultRepository` stores + exposes `detections`    |
| `apps/web/package.json`                        | Added `@devlens/detectors` dependency                           |
| `apps/web/src/app/api/scans/handler.ts`        | `detector` in options, `detections` in response                 |
| `apps/web/src/app/api/scans/route.ts`          | `NullDetector` in `createDependencies`                          |
| `apps/worker/package.json`                     | Added `@devlens/detectors` dependency                           |
| `apps/worker/src/main.ts`                      | Passes `NullDetector` to `runScan`                              |

### Modified (tests)

| File                                                   | Change                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `packages/application/src/orchestrator.test.ts`        | Mock detector injected, `detections` assertions, 1 new test         |
| `packages/application/src/execute-scan.test.ts`        | Mock detector injected                                              |
| `apps/web/src/app/api/scans/route.test.ts`             | Mock detector in `makeOptions`, 1 new test, `detections` assertions |
| `apps/web/src/app/api/scans/route.integration.test.ts` | Pass `NullDetector`, assert `body.detections`                       |
| `apps/worker/src/main.test.ts`                         | Added `detections: []` to all `ScanResult` literals                 |
| `packages/database/src/repository.test.ts`             | `detections: []` in saves, `getDetections` assertions               |
| `packages/database/src/postgres-repository.test.ts`    | `detections: []` in results, `detections` assertion                 |

### Modified (docs)

| File                                | Change                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `docs/architecture/overview.md`     | Dependency table, pipeline diagram, worker, persistence semantics       |
| `docs/architecture/application.md`  | `runScan` signature, `ScanResult`, dependency direction, file structure |
| `docs/architecture/api.md`          | Response JSON example, architecture diagram                             |
| `docs/architecture/domain-model.md` | Evidence note updated (types now wired)                                 |
| `docs/architecture/persistence.md`  | `ScanResult` shape, schema table, persistence semantics, worker code    |

## 5. Tests

| Suite                                                  | Tests                                        |
| ------------------------------------------------------ | -------------------------------------------- |
| `packages/application/src/orchestrator.test.ts`        | 11 (was 10; +1 new "runs detector" test)     |
| `packages/application/src/execute-scan.test.ts`        | 4 (updated)                                  |
| `apps/web/src/app/api/scans/route.test.ts`             | 16 (was 14; +1 new "detection results" test) |
| `apps/web/src/app/api/scans/route.integration.test.ts` | 2 (updated, pass against PG)                 |
| `apps/worker/src/main.test.ts`                         | 4 (updated)                                  |
| `packages/database/src/repository.test.ts`             | 5 (updated)                                  |
| `packages/database/src/postgres-repository.test.ts`    | 7 (updated, pass against PG)                 |

New test cases:

- `orchestrator.test.ts`: "runs the detector on the snapshot and includes detections in the result"
- `route.test.ts`: "includes detectors results in the response when the detector finds something"

## 6. Validation results

```
pnpm lint   ✅  (ESLint + Prettier clean)
pnpm typecheck ✅  (10/10 projects: config, core, validation, analyzer,
                   crawler, detectors, application, database, web, worker)
pnpm test   ✅  142 passed | 9 skipped (151 total, 17 files)
pnpm build  ✅  (10/10 projects)
madge --circular ✅  No circular dependency found
```

Integration tests (PostgreSQL 16.4, port 5433):

- `postgres-repository.test.ts`: 7/7 passed
- `route.integration.test.ts`: 2/2 passed (real HTTP fetch to example.com)

## 7. Remaining architectural gaps

- **Concrete detectors**: `@devlens/detectors` ships only `NullDetector`.
  No header-based, meta-tag-based, or script-URL-based detection yet.
- **`@devlens/analyzer`**: empty stub; the analysis engine that would
  coordinate multiple detectors and aggregate results has not been created.
- **`@devlens/validation`**: empty stub; input validation relies on
  inline inline logic in the handler.
- **`@devlens/config`**: empty stub.

## 8. Exact recommended next step

Implement the first **concrete detector** in `@devlens/detectors`:

```typescript
// packages/detectors/src/header-detector.ts
class HeaderDetector implements Detector {
  detect(snapshot: SiteSnapshot): Detection[] {
    // Scan HTTP response headers for known signatures
    // (e.g. "server" header → nginx, apache, etc.)
  }
}
```

Then compose it into a `CompositeDetector` that aggregates multiple
detectors, and wire it into the API route and worker in place of
`NullDetector`. This is the natural, incremental next step — the
abstraction and pipeline are already in place.
