DEVLENS — STEP 6H
Implement Resource Observation

Context

Step 6G is complete.

Current detector pipeline:

HttpCrawler
-> SiteSnapshot
-> CompositeDetector - HeaderDetector - MetaTagDetector - ScriptUrlDetector - ContentScriptDetector
-> DeduplicatingDetector
-> ScanResult

Current validation:

- pnpm typecheck: PASS
- pnpm test: 318 passed, 9 skipped
- pnpm lint: PASS
- pnpm build: PASS
- npx madge --circular: PASS

The detector pipeline currently observes:

- HTTP headers
- HTML meta tags
- script URLs
- inline script content

Objective

Extend SiteSnapshot and HttpCrawler with controlled resource observation.

IMPORTANT

This step is OBSERVATION ONLY.

Do NOT implement ResourceDetector in Step 6H.

Do NOT add technology detection logic.

Do NOT modify existing detectors.

Do NOT modify CompositeDetector.

Do NOT modify DeduplicatingDetector.

Do NOT implement confidence scoring.

Do NOT crawl arbitrary links.

Do NOT recursively crawl the site.

Security is a first-class requirement.

Initial resource scope

Implement observation for:

1. robots.txt
2. manifest.json
3. external CSS resources referenced by the HTML

Do NOT fetch external JavaScript bundles yet.

JavaScript resource observation should be deferred to a later sub-step because JS bundles can be large and numerous.

Resource domain model

Inspect the existing domain architecture first.

Introduce a Resource model consistent with existing value objects.

Recommended conceptual shape:

Resource {
url: Url;
type: ResourceType;
content: string;
status: number;
contentType: string | null;
}

ResourceType should be a controlled domain value, for example:

- css
- robots
- manifest

Use the project's existing branded/value-object conventions where appropriate.

Avoid unnecessary abstraction.

Snapshot

Add:

resources: ReadonlyArray<Resource>

to SiteSnapshot.

Ensure existing callers/tests constructing SiteSnapshot are updated with:

resources: []

where appropriate.

Crawler behavior

HttpCrawler should:

1. fetch the target page
2. parse HTML
3. identify candidate resources
4. fetch only the supported resource types
5. store successful observations in SiteSnapshot.resources

robots.txt:

- derive origin from the target URL
- fetch /robots.txt
- only accept same-origin robots.txt
- store content only when fetch succeeds

manifest:

- detect <link rel="manifest" href="...">
- resolve relative URLs against the page URL
- only fetch supported HTTP(S) URLs
- prefer same-origin resources
- do not recursively follow anything inside manifest.json

CSS:

- detect <link rel="stylesheet" href="...">
- resolve URLs against the page URL
- only fetch HTTP(S)
- only fetch same-origin CSS resources in Step 6H
- do not follow @import recursively
- deduplicate identical resource URLs
- impose a strict maximum number of CSS resources

Limits

Introduce conservative limits.

Recommended initial values:

MAX_CSS_RESOURCES = 5
MAX_RESOURCE_BYTES = 512 * 1024

These limits should be explicit and easy to change.

If a resource exceeds the byte limit:

- do not store the full content
- preferably skip it entirely
- do not crash the scan

Do not introduce unbounded memory usage.

HTTP requirements

Reuse existing crawler HTTP infrastructure where possible.

Respect:

- HTTP status
- Content-Type
- timeout behavior
- existing User-Agent behavior

Only store resources whose response is successful and whose content type is compatible with the expected resource type.

CSS:

accept text/css.

robots:

accept text/plain or a missing/loose Content-Type if existing crawler conventions make this necessary.

manifest:

accept application/manifest+json or application/json.

Do not execute content.

Do not parse CSS beyond identifying the resource.

Do not parse manifest beyond storing its content.

URL handling

Use existing createUrl() / URL value-object conventions.

Resolve relative URLs using the page URL.

Reject:

- javascript:
- data:
- blob:
- file:
- ftp:
- malformed URLs

SSRF protection

This is critical.

Do not allow arbitrary resource fetching.

Step 6H should only fetch:

- target origin / same-origin resources
- robots.txt at target origin
- stylesheet resources at target origin
- manifest resources at target origin

Reject redirects that escape the allowed origin.

Do not follow redirects to arbitrary origins.

If the existing HTTP abstraction does not expose enough information to enforce this, extend it minimally rather than bypassing it.

Deduplication

If the HTML contains:

<link rel="stylesheet" href="/app.css">
<link rel="stylesheet" href="/app.css">

fetch it once.

Resource identity should be normalized URL-based.

The same resource should not appear twice in SiteSnapshot.resources.

HTML parser

Extend the HTML extraction model only as necessary to identify:

- stylesheet links
- manifest link

Do not replace the existing regex parser wholesale.

Add focused parser tests.

Persistence

Inspect the existing PostgreSQL snapshot persistence.

Add a migration for:

html_resources

or another appropriately named JSONB column if that matches the existing schema conventions.

Persist:

Snapshot.resources

as JSONB.

Do not introduce normalized resource tables yet.

Keep persistence simple and consistent with:

htmlScripts
detections

Repository round-trip should preserve resource data.

Tests

Add tests for:

Domain:

1. Resource creation
2. ResourceType validity if applicable

Parser: 3. stylesheet link extraction 4. manifest link extraction 5. multiple stylesheet links 6. duplicate links 7. relative URLs 8. absolute URLs 9. unrelated links ignored

Crawler: 10. fetches same-origin CSS 11. fetches robots.txt 12. fetches manifest 13. stores content 14. ignores failed resources 15. ignores unsupported protocols 16. rejects cross-origin resources 17. respects MAX_CSS_RESOURCES 18. respects MAX_RESOURCE_BYTES 19. deduplicates resource URLs 20. handles resource timeout without failing scan 21. handles missing robots.txt 22. handles missing manifest 23. handles pages with no CSS

Persistence: 24. resource column exists 25. snapshotToRow includes resources 26. repository round-trip preserves resources

Security: 27. cross-origin stylesheet rejected 28. redirect to another origin rejected 29. data/javascript/blob URL rejected

Do not require PostgreSQL integration tests if the project convention currently skips them.

Architecture

Update:

architecture/crawler.md
architecture/persistence.md
architecture/overview.md

Document:

- Resource model
- supported resource types
- resource limits
- same-origin policy
- SSRF/redirect protection
- no recursive resource crawling
- JavaScript bundles intentionally deferred

Do NOT update detector documentation with ResourceDetector yet because it does not exist.

Validation

Run:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular

Also inspect the final dependency graph for new cycles.

Final report

Return:

1. objective
2. resource model
3. supported resource types
4. crawler behavior
5. security/SSRF protections
6. resource limits
7. parser changes
8. persistence changes
9. files created
10. files modified
11. tests added
12. validation results
13. remaining gaps
14. exact recommended next step

Scope boundary

Step 6H ONLY.

Do not implement ResourceDetector.
Do not fetch JavaScript bundles.
Do not implement scoring.
Do not implement new technology signatures.
Do not refactor the existing detector architecture.
