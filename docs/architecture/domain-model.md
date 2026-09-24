# Domain Model

The `@devlens/core` package contains the pure domain layer of DevLens.
It defines the vocabulary and invariants of a DevLens scan without
any dependency on infrastructure — no database, HTTP client, browser,
Node.js APIs, or UI framework.

## Concepts

### Scan

A `Scan` represents a user-requested analysis of a website. It is the
central aggregate root of the domain.

| Field       | Type         | Description                    |
| ----------- | ------------ | ------------------------------ |
| `id`        | `ScanId`     | Unique identifier              |
| `target`    | `ScanTarget` | The website being analyzed     |
| `status`    | `ScanStatus` | Finite lifecycle state (union) |
| `createdAt` | `Timestamp`  | When the scan was created      |

### ScanTarget

A `ScanTarget` holds the URL and hostname of the website to analyze.

| Field      | Type       | Description                             |
| ---------- | ---------- | --------------------------------------- |
| `url`      | `Url`      | The originally requested target URL     |
| `hostname` | `Hostname` | The hostname associated with the target |

**Decision: store both URL and hostname.**

`ScanTarget.url` is the URL the user originally supplied. `ScanTarget.hostname`
is the hostname associated with that target (derived or associated by
infrastructure). The domain does not parse URLs — it receives both
values from the infrastructure layer and stores them as branded types.

These values **do not** necessarily equal `SiteSnapshot.url` or
`SiteSnapshot.http.finalUrl`. Redirects can cause the final observed
URL to differ from the originally requested target URL. The `ScanTarget`
represents the user's intent; the `SiteSnapshot` represents the actual
observation.

The hostname is stored alongside the URL rather than derived from it
because the association is not always a simple parse — it may involve
redirect chains, CDN mappings, or custom domain associations.

### SiteSnapshot

A `SiteSnapshot` is an immutable observation of a website at a moment
in time. It does **not** perform any crawling or fetching — it only
structures the data that the crawler (a later step) will populate.

A `SiteSnapshot` is an **independent domain artifact**. It is not
embedded in `ScanStatus`. The scan lifecycle records _that_ and _when_
a scan finished; the snapshot is the result produced alongside that
completion.

| Field        | Type                      | Description                 |
| ------------ | ------------------------- | --------------------------- |
| `url`        | `Url`                     | Final URL of the response   |
| `hostname`   | `Hostname`                | Associated hostname         |
| `capturedAt` | `Timestamp`               | When the snapshot was taken |
| `http`       | `HttpObservation`         | HTTP response information   |
| `html`       | `HtmlObservation`         | HTML document metadata      |
| `resources`  | `ReadonlyArray<Resource>` | Discovered page resources   |

### Technology

A `Technology` represents a technology that DevLens can detect. The
domain model does not hardcode specific technologies — it only
defines the structure:

| Field      | Type                 | Description                     |
| ---------- | -------------------- | ------------------------------- |
| `id`       | `TechnologyId`       | Unique stable identifier        |
| `name`     | `string`             | Human-readable display name     |
| `category` | `TechnologyCategory` | Classification (branded string) |

`TechnologyCategory` is a branded `string`, not a closed union or an
arbitrary `string`.

**Decision: branded string, not a closed union.**
TechnologyCategory is a product/catalog classification — the valid
set of categories is determined by the product (which technologies
are tracked and how they are grouped), not by a domain invariant.
New categories may be introduced dynamically as detector definitions
are added. A branded string prevents mixing `TechnologyCategory` with
other string concepts (e.g. `Url`) at the type level, while remaining
extensible. The `createTechnologyCategory` factory enforces
non-emptiness.

### Detection

A `Detection` represents a belief that a `Technology` exists in a
`SiteSnapshot`.

| Field        | Type                      | Description             |
| ------------ | ------------------------- | ----------------------- |
| `technology` | `Technology`              | The detected technology |
| `confidence` | `Confidence`              | Confidence score 0–100  |
| `evidence`   | `ReadonlyArray<Evidence>` | Supporting observations |

The `createDetection` factory enforces that at least one evidence item
is present — a detection without evidence is meaningless.

### Evidence

`Evidence` is a discriminated union of observation types that support
a detection. The `type` field is the discriminant.

| Variant             | Fields                | Description                    |
| ------------------- | --------------------- | ------------------------------ |
| `html`              | `selector`, `snippet` | Pattern found in HTML document |
| `http_header`       | `name`, `value`       | HTTP response header           |
| `script_url`        | `url`                 | Script URL loaded by the page  |
| `meta_tag`          | `name`, `content`     | HTML meta tag                  |
| `script_content`    | `snippet`             | Inline script content          |
| `javascript_global` | `globalName`          | Global variable on `window`    |
| `resource`          | `url`                 | Resource URL                   |
| `link`              | `url`                 | `<link>` tag href URL          |

No concrete detector implementations exist yet. The `Detector`
abstraction lives in `@devlens/detectors` and is wired into the
`runScan` pipeline — it is invoked on the snapshot after crawl
success. Concrete detectors (header-based, HTML-pattern-based, etc.)
are deferred to a later step. The domain only defines the shape of
evidence records.

## Result pipeline

A finalized `Detection` is projected through a chain of **derived, pure
layers** after scoring. Each layer is a deterministic read over the previous
one — no layer fabricates data, re-scores, or re-crawls. The layers are owned
by distinct modules in `@devlens/core`:

```text
Observation
    ↓
Detection
    ↓
Deduplication
    ↓
Scoring (ConfidenceScorer / DetectionScorer)
    ↓
Scan Quality        (Step 79 — scan-level)        scan-result-quality.ts
    ↓
Provenance          (Step 80 — per-detection)     detection-provenance.ts
    ↓
Integrity           (Step 81 — per-detection)     detection-integrity.ts
    ↓
API / UI
```

### Ownership

| Layer      | Module (`@devlens/core`)     | What it is — single source of truth                                                                                                                                                                            |
| ---------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detection  | `detection.ts` (`Detection`) | What was detected: a technology, a confidence, and its evidence.                                                                                                                                               |
| Evidence   | `evidence.ts` (`Evidence`)   | Why it was detected: the raw observations backing a detection.                                                                                                                                                 |
| Quality    | `scan-result-quality.ts`     | Contextual quality of the _scan/result_ (observation coverage + signal quality). Scan-level, not per-detection.                                                                                                |
| Provenance | `detection-provenance.ts`    | Per-detection summary of _which_ evidence types support it — post-dedup evidence count, canonical evidence-type order, strongest type. Derived from existing evidence only.                                    |
| Integrity  | `detection-integrity.ts`     | Per-detection structural validator — a pure diagnostic that the finalized detection, its evidence, and its provenance remain internally consistent. Reports issues; never mutates, re-scores, or deduplicates. |

**Derivation rules:**

- **Quality** is derived from `ObservationCoverage` (Step 78) plus per-detection signal quality; it is a scan-level summary.
- **Provenance** is derived from a finalized `Detection`'s already-deduplicated `evidence`; it is absent for relationship-derived detections (no direct evidence).
- **Integrity** reuses the Step-80 provenance computation to verify `evidenceCount`, `evidenceTypes`, and `strongestEvidenceType` are consistent with the evidence. It is a pure, O(n), deterministic check with no IO.

## Value Objects

Value objects are branded primitive types. They prevent accidental
mixing of semantically different strings/numbers at the type level
while remaining plain strings/numbers at runtime.

| Type                 | Underlying | Invariant                       |
| -------------------- | ---------- | ------------------------------- |
| `ScanId`             | `string`   | Non-empty                       |
| `TechnologyId`       | `string`   | Non-empty                       |
| `Url`                | `string`   | Non-empty                       |
| `Hostname`           | `string`   | Non-empty                       |
| `Timestamp`          | `string`   | Valid ISO 8601 string           |
| `Confidence`         | `number`   | Finite, 0 ≤ value ≤ 100         |
| `HttpStatus`         | `number`   | Integer, 100 ≤ value ≤ 599      |
| `TechnologyCategory` | `string`   | Non-empty (branded, extensible) |

Each has a corresponding factory function (`createUrl`,
`createConfidence`, etc.) that validates the invariant at construction
time. Using a value object is preferred over a raw primitive when it
prevents a real class of bugs — e.g. confusing a `Url` with a
`TechnologyId`.

`TechnologyCategory` (defined in `technology.ts`) follows the same
pattern: a branded `string` with a `createTechnologyCategory` factory.

### Why not Zod?

Runtime validation of untrusted external input belongs to the
`validation` boundary package. The domain layer enforces its own
invariants through factory functions, which is sufficient because:

- Domain objects are created by controlled call sites (infrastructure,
  factories), not arbitrary user input.
- Branded types catch type-level mistakes at compile time.

## Timestamps

Timestamps are represented as ISO 8601 strings, not `Date` objects.
This keeps the domain portable — it makes no assumptions about the
runtime environment (Node.js, browser, or anything else).

The factory `createTimestamp(new Date())` is used by infrastructure to
produce a `Timestamp` from the system clock. The domain accepts
`Timestamp` values as parameters; it does not read the clock itself.

## Scan Lifecycle

`ScanStatus` is a discriminated union. Each variant carries only the
data relevant to that lifecycle stage — **not** the scan results:

```
pending   — no extra data
running   — startedAt: Timestamp
completed — completedAt: Timestamp
failed    — failedAt: Timestamp, error: ScanError
```

**Scan lifecycle ≠ scan results.** The `completed` status records only
the completion timestamp — it does not embed a `SiteSnapshot`. The
snapshot is an independent observation artifact produced by the crawler
and associated with the scan by the application layer.

This makes invalid states unrepresentable:

- A `pending` scan cannot have a `completedAt` (the field doesn't exist
  on that variant).
- A `completed` scan always has a `completedAt` and never carries a
  snapshot (that data doesn't exist on the variant).

### Valid transitions

```
  pending ──► running ──► completed
     │          │
     └─────────►│
               └──► failed
```

The `startScan`, `completeScan`, and `failScan` factory functions
enforce these transitions and throw if a transition is invalid (e.g.
starting a `completed` scan).

## Immutability

All domain objects use `readonly` fields. Factory functions return new
objects rather than mutating existing ones. This ensures that domain
state cannot be corrupted after construction.

## File Structure

```
src/
├── domain/
│   ├── value-objects.ts           # Branded types & factories
│   ├── scan.ts                    # Scan, ScanTarget, ScanStatus, lifecycle factories
│   ├── technology.ts              # Technology, TechnologyCategory
│   ├── detection.ts               # Detection, createDetection
│   ├── evidence.ts                # Evidence discriminated union
│   ├── snapshot.ts                # SiteSnapshot, HttpObservation, etc.
│   ├── observation-coverage.ts    # Step 78 — ObservationCoverage
│   ├── scan-result-quality.ts     # Step 79 — ScanResultQualitySummary
│   ├── detection-provenance.ts    # Step 80 — DetectionProvenance, computeDetectionProvenance
│   └── detection-integrity.ts     # Step 81 — DetectionIntegrity, computeDetectionIntegrity
└── index.ts                       # Public API re-exports
```

## Dependency Direction

```
@devlens/core
    ↓
  nothing
```

The core package has zero runtime dependencies. It imports only from
the standard JavaScript library (via `lib: ["ES2022"]`). No Node.js
modules, no browser APIs, no external packages.
