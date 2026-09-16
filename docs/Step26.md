Goal: allow users to compare two existing scans and understand what changed between them.

Step 25 established the scan result as a proper technical report.

Step 26 introduces historical comparison using the existing persisted ScanResult data.

Do NOT modify detectors, crawler behavior, scoring, or the existing scan execution pipeline.

The comparison must be deterministic and based only on existing scan results.

1. Inspect the existing ScanResult/API contracts.

Determine the exact fields available for:

- scan ID
- target
- timestamps
- status
- detections
- technology identity
- score/confidence
- evidence

Do not invent new domain fields.

2. Add a comparison route.

Preferred:

/scans/compare?left=<id>&right=<id>

The comparison page should load both scans through the existing HTTP API.

Do NOT access repositories or database code from the web application.

3. Add a typed comparison model.

Create a small pure comparison module, for example:

compareScans(left, right)

It should produce a presentation-oriented result describing:

- technologies added
- technologies removed
- technologies present in both
- score/confidence changes where meaningful
- evidence changes where meaningful

The comparison function must be:

- pure
- deterministic
- independent of React
- independent of HTTP
- independent of the database
- independently testable

4. Technology identity.

Compare technologies by their stable technology ID.

Do NOT compare by display name.

Do NOT treat ordering as a change.

For example:

Left:
React
Next.js
Cloudflare

Right:
React
Next.js
Vite

Result:

Added:
Vite

Removed:
Cloudflare

Unchanged:
React
Next.js

5. Score/confidence changes.

For technologies present in both scans:

Show the values returned by each scan.

If they differ, expose the delta.

Example:

React
Previous: 90
Current: 95
Change: +5

Do not create new scoring semantics.

Do not classify changes as "better", "worse", "improved", etc.

6. Evidence changes.

Where evidence exists for a technology in both scans, identify:

- evidence added
- evidence removed
- evidence unchanged

Use the existing canonical evidence identity semantics if they are already exposed/reusable.

Do NOT duplicate detector matching logic.

If the API does not expose enough information for reliable evidence comparison, document that limitation and compare only what can be established deterministically.

7. Handle scan compatibility.

Before comparing:

- both IDs must resolve
- both scans must be valid results
- targets should be displayed clearly

If one scan is missing:

- show a not-found state for that side

If both scans exist but have different targets:

- allow the comparison
- clearly display that the targets differ
- do not silently imply they are the same site

Do not block the comparison unless the existing domain contract requires it.

8. Handle failed scans.

Failed scans are valid historical records.

Do not pretend they contain a successful detection result.

If a comparison involves a failed scan:

- display its status
- clearly indicate that detection comparison is limited/unavailable for that side
- still show the scan metadata

Do not crash or fabricate empty successful results.

9. Comparison UI.

Create a clear report structure:

Scan comparison

Previous / Left
target
timestamp
status

Current / Right
target
timestamp
status

Technology changes

Added
Removed
Present in both

Score / confidence changes

Evidence changes

Avoid turning this into a dashboard of decorative cards.

The primary information should be textual and technical.

10. Navigation.

From `/scans` and `/scans/[id]`, provide a simple way to start a comparison.

Keep selection UX minimal.

A practical first version may use:

Compare with another scan

followed by an ID selector/input or links generated from history.

Do NOT build a complex comparison-selection system yet.

11. Empty/no-change state.

A comparison where both scans contain the same technologies and equivalent evidence should explicitly communicate:

No detection changes

Do not leave the section visually empty.

12. Tests.

Add pure comparison tests covering:

- technology added
- technology removed
- unchanged technology
- multiple additions/removals
- ranking changes without identity changes
- score change
- unchanged score
- evidence added
- evidence removed
- identical evidence
- different targets
- failed scan
- empty detection sets
- deterministic output

Add UI tests covering:

- successful comparison
- missing left scan
- missing right scan
- failed scan
- no changes
- technology changes
- score changes
- evidence changes

13. Keep architecture clean.

Preferred:

HTTP API client
↓
comparison adapter
↓
pure compareScans()
↓
presentation components

Do not put comparison logic directly into JSX.

Do not import:

- database
- repository
- detectors
- crawler

into the UI.

14. Do NOT add:

- database schema changes
- new API endpoints unless genuinely required
- new detector logic
- new evidence types
- new scoring logic
- background jobs
- realtime updates
- charts
- authentication
- accounts
- saved comparisons
- exports
- third-party dependencies

Prefer existing GET endpoints over adding a dedicated backend comparison endpoint.

15. Documentation.

Create:

docs/Step26-report.md

Document:

- comparison model
- identity rules
- score comparison
- evidence comparison
- failed scan behavior
- different-target behavior
- UI routes
- tests
- validation results

16. Validation.

Run:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps

Success criteria:

- two existing scans can be compared
- technology additions/removals are deterministic
- technology identity uses stable IDs
- ordering changes are ignored
- score/confidence changes are visible without new scoring semantics
- evidence changes are represented where reliably possible
- failed scans are handled honestly
- different targets are explicitly shown
- no-change comparisons have a clear state
- existing scan creation/history/detail functionality remains intact
- no unnecessary backend architecture
- all validation checks pass

After completion, report:

- files created
- files modified
- comparison model
- comparison semantics
- tests added
- validation results
- important implementation decisions
