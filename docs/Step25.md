Goal: turn the existing scan detail page into a clear, professional technology-detection report.

Step 24 established lifecycle-aware scan details and polling.

Step 25 focuses exclusively on the presentation and usability of completed detection results.

Do NOT change detector logic, scoring algorithms, crawler behavior, persistence, or API semantics.

1. Inspect the existing scan detail response and UI.

Identify the exact fields currently available for:

- scan metadata
- status
- detections
- technology identity
- category
- confidence / score
- evidence
- evidence type
- timestamps
- failure information

Use the existing API contract as the source of truth.

Do not invent fields that the API does not expose.

2. Redesign only the completed-results section.

For a completed scan, establish a clear visual hierarchy:

Scan target
↓
Scan status / metadata
↓
Detected technologies
↓
Evidence explaining each detection

The result should feel like a technical analysis report rather than a generic dashboard.

Avoid:

- excessive cards
- decorative gradients
- fake metrics
- giant hero sections
- unnecessary charts
- gamification

3. Detection list.

Create a reusable presentation component for detections.

Each detection should clearly expose:

- technology name
- category
- confidence/score
- evidence count
- evidence summary

Use the existing ranking returned by the API.

Do NOT re-sort detections in the frontend.

Do NOT recalculate scores.

4. Detection detail / evidence.

Make evidence inspectable without overwhelming the initial view.

A reasonable structure is:

React
Frontend
Score: 95

Evidence
├── script_url
│ └── ...
└── ...

Use the actual evidence data already returned by the API.

Different evidence variants should render safely and readably.

Do not create detector-specific frontend logic that duplicates backend detection rules.

Prefer a small presentation mapping layer such as:

evidence type → human-readable representation

rather than reproducing detector implementation details.

5. Evidence presentation.

Support every evidence type currently exposed by the API.

At minimum verify handling for:

- http_header
- meta_tag
- script_url
- script_content
- resource
- link

Also account safely for future/unknown evidence types.

Unknown evidence must not crash the page.

Render a sensible fallback representation.

6. Confidence / score presentation.

Use the existing score/confidence values exactly as returned by the API.

Make the distinction clear if both values exist.

Do not introduce another scoring system.

Do not use subjective labels such as:

- "excellent detection"
- "very likely"
- "weak"
- "bad"

unless those labels already exist in the API/domain contract.

7. Empty results.

A completed scan with zero detections is a valid result.

Create a dedicated state explaining:

- the scan completed
- no supported technologies were detected

Do not display it as an error.

8. Large result sets.

Keep the initial implementation simple, but make sure the layout remains usable if a scan contains many detections.

Avoid:

- enormous horizontal tables
- fixed-width layouts
- deeply nested containers
- excessive DOM duplication

A vertical result list is acceptable.

Do not add pagination yet.

9. Responsive behavior.

The detail report must remain usable on:

- desktop
- tablet
- narrow mobile widths

Evidence values such as URLs and header values must wrap safely.

Do not allow long technical strings to break the layout.

10. Accessibility.

Use semantic HTML where appropriate:

- headings
- lists
- buttons
- links
- expandable controls if introduced

Interactive evidence expansion must be keyboard accessible.

Do not rely exclusively on color to communicate score/status.

11. Preserve lifecycle states.

Step 25 must not regress Step 24.

Ensure:

- pending → scanning UI
- running → scanning UI
- completed → detection report
- failed → failure UI

Polling behavior remains unchanged.

12. Keep the architecture simple.

Preferred:

ScanDetail
↓
ScanSummary
DetectionList
↓
DetectionItem
↓
EvidenceList
↓
EvidenceItem

Keep these components presentation-oriented.

They should consume typed API data.

Do not import:

- database
- repositories
- detectors
- crawler
- domain implementation

into the web UI.

13. Tests.

Add focused tests covering:

Detection rendering:

- multiple technologies
- technology metadata
- score/confidence
- ranking is preserved
- evidence rendering

Evidence:

- each current evidence type
- multiple evidence items
- long values
- unknown evidence type

Results:

- zero detections
- many detections
- completed scan

Regression:

- pending
- running
- failed
- polling behavior from Step 24

Prefer the existing renderToString/test approach where appropriate.

Do not add jsdom or another testing dependency unless genuinely necessary.

14. Do NOT add:

- new detector types
- new technologies
- scoring changes
- crawler changes
- API changes
- database changes
- charts
- analytics
- search
- filtering
- pagination
- authentication
- user accounts
- export/PDF
- third-party UI libraries
- unnecessary dependencies

15. Documentation.

Create:

docs/Step25-report.md

Document:

- result UI structure
- detection presentation
- evidence presentation
- unknown evidence handling
- empty state
- responsive/accessibility considerations
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

- completed scans provide a clear technology report
- detection ranking from the API is preserved
- scores/confidence are displayed exactly as provided
- all current evidence types render safely
- unknown evidence types do not crash the UI
- zero-detection scans have a dedicated valid state
- long technical values remain readable
- lifecycle behavior from Step 24 remains intact
- no backend/detection changes
- no unnecessary dependencies
- all validation checks pass

After completion, report:

- files created
- files modified
- UI structure
- evidence types covered
- tests added
- validation results
- important implementation decisions
