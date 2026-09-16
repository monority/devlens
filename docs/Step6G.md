DEVLENS — STEP 6G
Implement DeduplicatingDetector

Context

Step 6F is complete.

DevLens now has four concrete detectors:

- HeaderDetector
- MetaTagDetector
- ScriptUrlDetector
- ContentScriptDetector

And four evidence sources:

- HttpHeaderEvidence
- MetaTagEvidence
- ScriptUrlEvidence
- ScriptContentEvidence

Current validation after Step 6F:

- pnpm typecheck: PASS
- pnpm test: 295 passed, 9 skipped
- pnpm lint: PASS
- pnpm build: PASS
- npx madge --circular: PASS

Current problem

CompositeDetector intentionally concatenates detections without deduplication.

The same technology can therefore appear multiple times:

Next.js 90 — ScriptUrlEvidence
Next.js 95 — ScriptContentEvidence
Next.js 85 — MetaTagEvidence

This is now undesirable at the application boundary because a ScanResult may contain multiple Detection objects representing the same technology.

Objective

Implement a DeduplicatingDetector wrapper / detector-adjacent component.

IMPORTANT:

- Do NOT modify the existing CompositeDetector.
- Do NOT modify HeaderDetector.
- Do NOT modify MetaTagDetector.
- Do NOT modify ScriptUrlDetector.
- Do NOT modify ContentScriptDetector.
- Do NOT introduce resource crawling.
- Do NOT introduce scoring/ranking beyond selecting the highest-confidence detection.
- Do NOT introduce database changes.
- Keep the existing detector contracts intact.

Architecture

Create:

packages/detectors/src/deduplicating-detector.ts

Create tests:

packages/detectors/src/deduplicating-detector.test.ts

The component should wrap an existing Detector.

Conceptually:

CompositeDetector
-> produces Detection[]
-> DeduplicatingDetector
-> produces deduplicated Detection[]

Use the existing Detector interface if that is the cleanest fit.

The wrapper must accept another Detector and delegate detection to it.

Deduplication algorithm

Group detections by:

detection.technology

For each technology:

1. collect every Detection
2. select the Detection with the highest confidence
3. merge evidence from every duplicate Detection
4. return exactly one Detection

Example:

Input:

[
{
technology: "nextjs",
confidence: 90,
evidence: [
{ type: "script_url", ... }
]
},
{
technology: "nextjs",
confidence: 95,
evidence: [
{ type: "script_content", ... }
]
},
{
technology: "nextjs",
confidence: 85,
evidence: [
{ type: "meta_tag", ... }
]
}
]

Output:

[
{
technology: "nextjs",
confidence: 95,
evidence: [
{ type: "script_url", ... },
{ type: "script_content", ... },
{ type: "meta_tag", ... }
]
}
]

Important semantics

The representative Detection should be the highest-confidence Detection.

Its:

- technology
- category
- confidence

should remain authoritative.

Evidence from ALL duplicate detections must be preserved.

Do not lose weaker evidence merely because a stronger detection exists.

Evidence ordering

Preserve deterministic ordering.

Prefer the evidence order produced by the wrapped detector.

Do not sort evidence alphabetically unless existing project conventions require it.

Duplicate evidence

If two detections contain exactly identical evidence objects, avoid inserting the exact same evidence twice.

Use a deterministic structural comparison appropriate for the existing Evidence union.

Do not introduce an external dependency just for deep equality.

Detection identity

Do not blindly preserve every duplicate Detection id.

The output represents one logical technology detection.

Use the representative highest-confidence Detection as the basis for the resulting Detection, preserving its identity if that matches existing domain conventions.

If the domain contract makes IDs creation-specific, inspect createDetection() and follow the existing project semantics instead of inventing new ID behavior.

Confidence ties

If multiple detections have the same confidence:

- use the first detection returned by the wrapped detector as the representative
- merge evidence from all tied detections

Do not invent another ranking system in Step 6G.

Category consistency

Normally all detections for a technology should have the same category.

If inconsistent categories are encountered:

- do not silently invent a new category
- preserve the representative detection's category
- add a focused test documenting this behavior

No scoring

Do NOT aggregate confidence.

For example:

90 + 95 + 85 must NOT become 270 or 100.

The resulting confidence is simply:

95

This is deduplication, not scoring.

Exports

Export DeduplicatingDetector from:

packages/detectors/src/index.ts

Re-export it from application if that is the established package convention.

Wiring

Wire the deduplication layer at the application boundary.

Preferred conceptual structure:

const detector = new DeduplicatingDetector(
new CompositeDetector([
new HeaderDetector(),
new MetaTagDetector(),
new ScriptUrlDetector(),
new ContentScriptDetector(),
])
);

Use this consistently in:

- web API route dependencies
- worker main dependencies

Do not place deduplication inside individual detectors.

Tests

Add focused tests covering at minimum:

1. delegates to wrapped detector
2. returns detections unchanged when no duplicate technologies exist
3. groups detections by technology
4. keeps exactly one detection per technology
5. selects highest confidence
6. merges evidence from weaker detections
7. preserves all different evidence types
8. preserves deterministic evidence order
9. removes exact duplicate evidence
10. handles one detection
11. handles empty result
12. handles multiple technologies
13. handles confidence ties
14. first detection wins representative selection on ties
15. preserves representative category
16. documents inconsistent-category behavior
17. does not aggregate confidence
18. preserves the representative detection identity according to existing domain semantics

Also test realistic integration-like data:

Next.js detected by:

- meta tag
- script URL
- inline script

must result in:

ONE Next.js Detection

with:

- highest confidence
- all evidence sources preserved.

Similarly test WordPress and React where practical.

Architecture documentation

Update:

architecture/detectors.md
architecture/overview.md

Document:

- why deduplication exists
- where it sits in the pipeline
- grouping by technologyId
- highest-confidence representative
- evidence merging
- no confidence aggregation
- deterministic tie behavior

Do not claim that this is a scoring system.

Persistence

No database schema changes should be required.

The final ScanResult still contains Detection[].

Only the shape/count of detections changes before persistence.

Validation

Run:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular

Do not consider Step 6G complete unless all pass.

Final report

Return:

1. objective
2. architecture
3. files created
4. files modified
5. deduplication algorithm
6. representative detection semantics
7. evidence merge semantics
8. tie behavior
9. tests added
10. validation results
11. remaining architectural gaps
12. exact recommended next step

Scope boundary

Step 6G ONLY.

Do not implement:

- ResourceDetector
- resource crawling
- confidence scoring
- weighted scoring
- React/Vue improvements
- new technology signatures
- database indexes
- UI changes
