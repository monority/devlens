# Step 6I — Final Report

## 1. Objective

Implement a `ResourceDetector` — a new `Detector` implementation that
analyzes `SiteSnapshot.resources` (the resources observed by `HttpCrawler`
during Step 6H: robots.txt, manifest.json, same-origin CSS) and produces
`Detection` objects for known technology signatures.

**Observation only.** No new resources are fetched. No JavaScript bundle
detection. No scoring system. No modifications to `CompositeDetector` or
`DeduplicatingDetector`. The detector is integrated into all existing
pipeline wiring (Web API + Worker).

## 2. Resource Model (consumed from Step 6H)

`ResourceDetector` reads `SiteSnapshot.resources: ReadonlyArray<Resource>`.
Each `Resource` has:

```typescript
interface Resource {
  url: Url;
  type: ResourceType; // 'robots' | 'manifest' | 'css' | ...
  size: number | null;
  content: string;
  httpStatus: HttpStatus;
  contentType: string | null;
}
```

The detector uses `resource.content` (the fetched body text) and
`resource.type` (the resource type) as inputs. It does **not** use
`url`, `size`, `httpStatus`, or `contentType` for matching — only
`content` and `type`.

## 3. Supported Signatures

| Resource type | Content contains | Technology | Category         | Confidence |
| ------------- | ---------------- | ---------- | ---------------- | ---------- |
| `robots`      | `wp-admin`       | WordPress  | `cms`            | 90         |
| `robots`      | `wp-includes`    | WordPress  | `cms`            | 90         |
| `manifest`    | `gcm_sender_id`  | Firebase   | `service_worker` | 95         |
| `css`         | `--wp--preset--` | WordPress  | `cms`            | 95         |
| `css`         | `wp-block-`      | WordPress  | `cms`            | 90         |

## 4. Detector Behavior

`ResourceDetector` (in `packages/detectors/src/resource-detector.ts`)
implements the `Detector` interface (`detect(snapshot: SiteSnapshot): Detection[]`).

The algorithm:

1. Iterates all signatures in table order.
2. For each signature, finds the **first** resource whose `type` matches
   `matchType` and whose `content` (lowercased) contains the
   `matchContent` substring.
3. Groups matching signatures by `technologyId`.
4. For each technology group:
   - Selects the **highest confidence** match as the representative
     (on ties, the first signature in table order wins — deterministic).
   - Merges evidence from all matching signatures (in signature-table
     order), removing exact-duplicate evidence items.
5. Returns one `Detection` per technology.

This mirrors the `DeduplicatingDetector` semantics
(best-confidence + evidence-merge) **within** a single detector, while
leaving cross-detector deduplication to `DeduplicatingDetector`.

## 5. Security / Risk Considerations

- **No network access**: the detector reads only already-captured
  `SiteSnapshot.resources`. No HTTP requests are made.
- **No JavaScript execution**: resource bodies are treated as plain
  text strings. No parsing, no evaluation.
- **Type-scoped matching**: signatures only match on the intended
  `ResourceType`. A `wp-admin` fingerprint in CSS content does **not**
  trigger a WordPress detection.
- **Case-insensitive substring**: content matching is case-insensitive
  (`DISALLOW: /WP-ADMIN/` matches `wp-admin`).

## 6. Evidence Model

Each detection includes one or more `ResourceEvidence` items:

```typescript
{
  type: 'resource',
  url: 'https://example.com/robots.txt',
}
```

When multiple signatures match the same technology (e.g. `wp-admin`
and `wp-includes` in the same robots.txt), evidence from both is merged.
Exact-duplicate evidence (same `type` + `url`) is removed within the
detector via `JSON.stringify` comparison, matching `DeduplicatingDetector`'s
approach.

## 7. Deduplication

- **Internal** (within `ResourceDetector`): one `Detection` per
  technology ID. Best-confidence representative selected. Evidence
  merged deterministically. Exact-duplicate evidence removed.
- **Cross-detector**: handled by `DeduplicatingDetector` at the
  application boundary (e.g. WordPress detected by both
  `MetaTagDetector` and `ResourceDetector` → merged into one
  detection with combined evidence).
- `ResourceDetector` does **not** modify `DeduplicatingDetector` or
  `CompositeDetector`.

## 8. Implementation Details

**Conservative signatures**:

- `wp-admin` and `wp-includes` in robots.txt are extremely specific to
  WordPress — no other technology uses these path conventions in
  `robots.txt` `Disallow` directives.
- `gcm_sender_id` in manifest.json is a well-known Firebase-specific
  web app manifest key. No false-positive risk from generic `gcm`
  substrings.
- `--wp--preset--` in CSS is a WordPress 5.9+ block-editor CSS custom
  property prefix. Exceedingly unlikely in non-WordPress CSS.
- `wp-block-` in CSS is the WordPress block editor class prefix.
  Generic CSS substrings like `wp`, `WordPress`, or `wp-content` do
  **not** match.

## 9. Pipeline Integration

`ResourceDetector` was added to the `CompositeDetector` chain in both
production wiring points:

### Web API (`apps/web/src/app/api/scans/route.ts`)

```typescript
detector: new DeduplicatingDetector(
  new CompositeDetector([
    new HeaderDetector(),
    new MetaTagDetector(),
    new ScriptUrlDetector(),
    new ContentScriptDetector(),
    new ResourceDetector(),    // ← new
  ]),
),
```

### Worker (`apps/worker/src/main.ts`)

```typescript
new DeduplicatingDetector(
  new CompositeDetector([
    new HeaderDetector(),
    new MetaTagDetector(),
    new ScriptUrlDetector(),
    new ContentScriptDetector(),
    new ResourceDetector(),    // ← new
  ]),
),
```

No other changes to either pipeline. The `Detector` interface is
unchanged. `CompositeDetector` and `DeduplicatingDetector` are
unchanged.

## 10. Files Created

| File                                               | Purpose                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/detectors/src/resource-detector.ts`      | `ResourceDetector` class + signature table                       |
| `packages/detectors/src/resource-detector.test.ts` | 26 tests (positive, negative, false-positive, dedup, edge cases) |
| `docs/Step6I-report.md`                            | This report                                                      |

## 11. Files Modified

| File                                  | Change                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/detectors/src/index.ts`     | Added `export { ResourceDetector }`                                                               |
| `apps/web/src/app/api/scans/route.ts` | Added `ResourceDetector` import; added to `CompositeDetector` in `createDependencies()`           |
| `apps/worker/src/main.ts`             | Added `ResourceDetector` import; added to `CompositeDetector` in `main()`                         |
| `docs/architecture/detectors.md`      | Added `ResourceDetector` section; updated file structure table; updated production wiring diagram |
| `docs/architecture/overview.md`       | Updated detector count ("eight exports"); added `ResourceDetector` description                    |
| `docs/Step6I.md`                      | Formatted with Prettier (no content change)                                                       |

## 12. Tests Added

| Category                  | Test                                                                                                                                                 | Count  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| robots.txt positive       | Detects WordPress from wp-admin / wp-includes                                                                                                        | 2      |
| robots.txt negative       | No WP patterns in robots / no match on CSS type                                                                                                      | 2      |
| manifest positive         | Detects Firebase from gcm_sender_id                                                                                                                  | 1      |
| manifest negative         | No gcm_sender_id / no match on CSS type                                                                                                              | 2      |
| CSS positive              | Detects WordPress from --wp--preset-- / wp-block-                                                                                                    | 2      |
| CSS multi-tech            | Detects multiple technologies                                                                                                                        | 1      |
| Confidence/evidence merge | Best confidence + merged evidence / same-resource dedup / tie-breaking                                                                               | 3      |
| CSS false positives       | "WordPress" word / "wp" alone / "wpblock" / "wp-content" in url() / robots content in CSS comment / "wp-admin" as CSS class / "gcm" without full key | 7      |
| Deduplication             | Multiple CSS files same signature                                                                                                                    | 1      |
| Edge cases                | Empty resources / empty content / null contentType / case-insensitive / never throws                                                                 | 5      |
| **Total**                 |                                                                                                                                                      | **26** |

All 26 tests pass.

## 13. Validation Results

| Check           | Command                                                                                                                                                                           | Result                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Core build      | `pnpm --filter @devlens/core build`                                                                                                                                               | ✅ OK                                                                          |
| Detectors build | `pnpm --filter @devlens/detectors build`                                                                                                                                          | ✅ OK                                                                          |
| Typecheck       | `pnpm typecheck`                                                                                                                                                                  | ✅ 10 projects, 0 errors                                                       |
| Tests           | `pnpm test`                                                                                                                                                                       | ✅ 375 passed, 9 skipped                                                       |
| Lint            | `pnpm lint`                                                                                                                                                                       | ✅ ESLint 0 errors, Prettier clean                                             |
| Build           | `pnpm build`                                                                                                                                                                      | ✅ All packages (core, detectors, crawler, application, database, web, worker) |
| Circular deps   | `npx madge --circular --extensions ts,tsx --ts-config tsconfig.json packages/core/src packages/detectors/src packages/crawler/src packages/application/src packages/database/src` | ✅ No circular dependency found (78 files)                                     |

## 14. Remaining Gaps

- **Limited signature coverage**: only 5 signatures across 2 technologies
  (WordPress and Firebase). More signatures (e.g. Cloudflare in robots.txt,
  other CMS/PWA indicators in manifest, framework-specific CSS patterns) can
  be added conservatively as real-world data is collected.
- **No CSS content parsing**: CSS is matched via substring only. No
  `url()`, `@import`, or font-face parsing. This is intentional to avoid
  false positives and scope creep.
- **No version extraction**: detected technologies do not include version
  information. The `ResourceEvidence` only records the URL.
- **PostgreSQL integration**: skip-guarded tests for JSONB round-trip of
  `ResourceEvidence` are not exercised without `DATABASE_URL`. The
  in-memory repository tests and the JSONB column structure (identical to
  existing `headers`/`detections` columns validated in Step 5C) cover the
  round-trip logic.
- **No end-to-end integration test**: a full pipeline test (crawl → detect
  → persist with `ResourceDetector`) would require a real database and
  network access. The unit tests cover the detector logic; integration is
  handled by the existing `route.integration.test.ts` and
  `postgres-repository.test.ts` (skip-guarded).
