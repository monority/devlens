Goal: allow users to export an existing scan result as a stable, machine-readable JSON document.

Step 28 established `/scans/[id]` as a standalone shareable report.

Step 29 adds export functionality without changing scan execution, detection, scoring, or persistence.

Primary export format:

JSON

The exported document should represent the existing API scan result faithfully.

Do NOT create a second domain representation of a scan.

1. Inspect the existing API response contract.

Identify the exact stable fields currently exposed by:

GET /api/scans/:id

The export must be based on the existing API representation.

Do not export:

- database internals
- repository state
- crawler internals
- stack traces
- environment variables
- internal filesystem paths

2. Define an explicit export representation.

Create a pure mapping function, for example:

scanToExport(scan)

It should:

- accept the typed API scan result
- return a JSON-serializable object
- preserve meaningful fields
- preserve detection ordering
- preserve evidence
- preserve timestamps
- preserve status
- preserve failure information only when already part of the public API response

Do not calculate new scores.

Do not recalculate detections.

Do not mutate the source object.

3. Establish a stable export envelope.

Use a small explicit structure rather than dumping arbitrary application state.

For example conceptually:

{
"format": "devlens.scan",
"version": 1,
"scan": {
...
}
}

Choose the exact shape based on the existing API contract.

The format/version fields must make future export evolution possible without ambiguity.

Do not introduce unnecessary metadata.

4. Deterministic serialization.

The same scan result should produce semantically identical JSON regardless of runtime ordering.

Requirements:

- stable field ordering where practical
- existing detection order preserved
- evidence order deterministic
- no runtime timestamps generated during export
- no random IDs
- no environment-dependent fields

The exported JSON should be suitable for:

- version control
- CI artifacts
- debugging
- external tooling

5. Add a download action.

On:

/scans/[id]

add:

Export JSON

The action should download a file rather than merely display JSON.

Suggested filename:

devlens-<scan-id>.json

Use safe filename handling.

Do not expose the raw target URL as the filename.

6. Prefer a client boundary only where necessary.

The existing report should remain server-rendered.

The export interaction may use a small client component if needed.

Do not turn the entire report into a client component.

Prefer browser-native APIs:

- Blob
- URL.createObjectURL
- `<a download>`

No third-party download library.

7. Consider a server-side alternative.

Before implementing a client-generated download, inspect whether the existing architecture makes a server-generated download route cleaner.

If a dedicated route is clearly appropriate, it may be added:

GET /api/scans/:id/export

However:

- reuse the existing scan retrieval logic
- reuse the same export mapper
- do not duplicate repository logic
- preserve the existing API error semantics
- do not create a second scan representation

Choose the simplest architecture that keeps the export reusable and testable.

8. Content type and encoding.

The exported document must be valid UTF-8 JSON.

Use:

application/json

when served through HTTP.

Ensure special characters in:

- URLs
- technology names
- evidence
- headers
- script content

remain valid.

9. Failed and empty scans.

Export must work for:

- completed scans
- failed scans
- zero-detection scans
- scans with many detections

A failed scan must not be converted into a fake successful result.

10. Unknown/not-found scans.

If the scan does not exist:

- do not generate an export
- preserve the existing 404 behavior

If using a server export endpoint, return the same public not-found semantics as the existing GET API.

11. Security.

Export only data already exposed through the public scan API.

Do not accidentally export:

- cookies
- authorization headers
- server environment variables
- database connection details
- stack traces
- internal request metadata

Review evidence carefully because some evidence values may contain arbitrary site-provided content.

12. Tests.

Pure export tests:

- completed scan
- failed scan
- zero detections
- multiple detections
- all evidence types
- deterministic output
- input immutability
- special characters
- version/format fields

If a download component is used:

- renders action
- successful export
- generated filename
- JSON content
- cleanup of object URL where applicable

If an HTTP endpoint is added:

- successful export
- content type
- body shape
- 404
- no internal error leakage

13. Do NOT add:

- CSV export
- PDF export
- Markdown export
- scheduled exports
- email
- cloud storage
- authentication
- share permissions
- database changes
- new dependencies
- export history
- background jobs

JSON only for this step.

14. Documentation.

Create:

docs/Step29-report.md

Document:

- export format
- versioning
- exported fields
- deterministic serialization
- filename
- delivery mechanism
- security boundaries
- tests
- validation results

15. Validation.

Run:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
npx madge --circular --extensions ts packages apps

Success criteria:

- completed scans can be exported as JSON
- failed scans can be exported without fabricating success
- zero-detection scans export correctly
- detection order is preserved
- evidence is preserved
- output is deterministic
- format/version are explicit
- download filename is safe
- no internal information leaks
- report remains server-rendered except for the minimal interaction if needed
- existing scan/history/comparison functionality remains intact
- no detector/backend changes
- no unnecessary dependencies
- all validation checks pass

After completion, report:

- files created
- files modified
- export schema
- delivery mechanism
- tests added
- validation results
- important implementation decisions
