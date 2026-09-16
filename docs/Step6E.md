Continue DevLens from the completed Step 6D state.

Step 6D is COMPLETE.

Current detector architecture:

SiteSnapshot
↓
CompositeDetector
├── HeaderDetector
└── MetaTagDetector
↓
Detection[]
↓
ScanResult
↓
persistence

Step 6D delivered:

- MetaTag domain observation
- crawler extraction of <meta> tags
- persistence of metaTags
- MetaTagDetector
- 7 generator signatures
- MetaTagEvidence
- CompositeDetector wiring
- complete test coverage

Validation:

- pnpm lint ✅
- pnpm typecheck ✅ 10/10
- pnpm test ✅ 227 passed, 9 skipped
- pnpm build ✅
- madge --circular ✅
- PostgreSQL integration ✅ 9/9

NEXT STEP: Step 6E — ScriptUrlDetector.

Before changing code, inspect the CURRENT repository.

Specifically determine:

1. The exact current SiteSnapshot structure.
2. The exact current HtmlObservation structure.
3. Whether script elements / script src URLs are already captured by the crawler.
4. Existing HTML parser abstractions and tests.
5. Existing Detection / Evidence contracts.
6. Existing detector conventions.
7. Existing CompositeDetector behavior.

Do not assume any of these contracts.

Objective:

Implement a ScriptUrlDetector that detects technologies from external JavaScript URLs already observed in the crawled HTML.

Architecture requirements:

- Detector remains framework-independent.
- No network requests.
- No database access.
- No Next.js dependency.
- No changes to runScan(), executeScan(), or ScanResult.
- Reuse the existing CompositeDetector.
- Do not duplicate parsing logic already present in the crawler/parser.

If script URLs are NOT currently represented in SiteSnapshot:

First extend the smallest appropriate domain observation contract and crawler extraction layer to expose them.

The representation should be minimal, deterministic, and preserve the original script src URL.

Do not introduce a general DOM model.

Detection signatures:

Start with a SMALL explicit signature table.

Examples of candidates:

- /wp-content/ or /wp-includes/ → WordPress
- /_next/static/ → Next.js
- /gatsby- → Gatsby
- /nuxt/ or /_nuxt/ → Nuxt.js
- recognizable React/Vue runtime bundle URLs only if the URL pattern is sufficiently reliable

Be conservative.

Do NOT claim that a generic JavaScript bundle means React/Vue/etc.

Prefer strong URL fingerprints over speculative framework detection.

Evidence:

Use the existing Evidence model.
If no suitable script URL evidence type exists, add the smallest domain-level evidence variant necessary, following the existing HttpHeaderEvidence and MetaTagEvidence patterns.

Evidence must preserve the actual observed script URL.

Deduplication:

Follow the existing Detection semantics and CompositeDetector policy.

Do not invent a new global deduplication policy.

If the same technology is observed through several script URLs, determine from the existing domain semantics whether:

- one Detection with multiple evidence items is intended, or
- multiple Detection objects are valid.

Do not silently discard useful evidence.

Testing:

Add focused ScriptUrlDetector tests for:

1. WordPress URL signature
2. Next.js URL signature
3. Gatsby URL signature
4. Nuxt.js URL signature
5. multiple script URLs
6. case-insensitive matching where appropriate
7. unrelated script URLs
8. empty/missing script URLs
9. duplicate signatures
10. strong false-positive cases that must NOT trigger

Also add parser/crawler tests only if script URL extraction did not already exist.

Wiring:

Use the existing CompositeDetector:

CompositeDetector([
new HeaderDetector(),
new MetaTagDetector(),
new ScriptUrlDetector(),
])

Update web, worker, and relevant integration wiring only if required.

Do not change the HTTP API response shape.

Persistence:

If SiteSnapshot's new script URL observation is persisted, add the smallest necessary migration and repository mapping.

Do not modify detection persistence; detections are already persisted as JSONB.

Documentation:

Update detector documentation with:

- supported script URL signatures
- evidence semantics
- conservative matching policy
- known false-positive limitations

Do not add unrelated documentation.

Validation:

Run:

- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- madge --circular
- PostgreSQL integration tests if DB-backed tests are affected

Do not proceed to another detector.

Final report:

1. Objective
2. Existing contracts inspected
3. Whether script URL observation already existed
4. Domain/crawler changes
5. Script signatures implemented
6. Evidence representation
7. Deduplication behavior
8. Files created/modified
9. Tests added
10. Validation results
11. False-positive limitations
12. Remaining architectural gaps
13. Exact recommended next step

Keep Step 6E minimal and architecture-first.
Do not refactor unrelated code.
