# Step 68 — Declarative Technology Signature Expansion

**Commit:** `Step 68: Declarative Technology Signature Expansion`
**Status:** ✅ All green (typecheck, ESLint, Prettier, vitest, build)

> This is the Step-68 engineering report (the `docs/Step68.md` spec is the
> immutable requirements source and is intentionally **not** committed).
> Step 67 (`b0b4abe`) — the version-extraction architecture — is complete and
> green and is consumed unchanged by this step.

## Executive summary

Step 68 proves the Step-67 version-extraction architecture **scales to
additional technologies via declarative signature data — not new detector
code**. The detection engine (`CompositeDetector → DeduplicatingDetector →
ScoringDetector(ConfidenceScorer)`) was **not rewritten**: no plugin runtime,
no DI, no dynamic code execution. Instead, the technology _catalog_ was
reorganized into **per-technology definition files**, a **catalog-validation
guard** was added, and the **6 detectors** were wired to source their
signature tables from the catalog via a single accessor.

Net result: the catalog grew from **32 → 54 technologies (22 new)**, every new
technology detected through a deterministic signature, with the full existing
test suite (and a large new fixture/collision/validation corpus) remaining
green. The ranking contract (`confidence DESC, technology.id ASC`,
`min(100, round(base + min(10,(n_types−1)·5)))`, `clampConfidence`, version
rendered **without** `%`) is unchanged.

## Goals & non-negotiable constraints

- **Do NOT rewrite the detection engine.** Reuse the existing composite. New
  techs = a deterministic signature, never `if (technology === 'foo')`
  branches, never per-tech detector classes, never a giant switch.
- **No new crawler capabilities.** No browser/Playwright/DOM/CSS-runtime/DNS/TLS/
  favicon-md5/cookies/JS-XHR beyond the existing snapshot.
- **`confidence DESC, technology.id ASC`** ranking preserved; score
  `min(100, round(base + min(10,(n_types−1)·5)))`, `clampConfidence`
  (NaN→0, Inf→100), confidence rendered without `%`.
- **Phase-12 proof:** ≥1 final technology added using ONLY a declarative
  definition + fixture + test — no changes to detector/scoring/dedup/
  production-detector composition.
- **Commit hygiene:** stage ONLY Step-68 code/tests/docs; never stage
  `.poolside/`, `settings.local.yaml`, `.env*`, or `docs/Step67.md`/
  `docs/Step68.md` spec.

## Architecture decision (Phase 2 — Option B)

`TechnologyDefinition` carries **per-source optional signature arrays** and a
single `signaturesFor(kind)` accessor:

```ts
interface TechnologyDefinition {
  id: TechnologyId;
  name: string;
  category: TechnologyCategory;
  headerSignatures?: HeaderSignature[];
  metaSignatures?: MetaTagSignature[];
  scriptUrlSignatures?: ScriptUrlSignature[];
  contentSignatures?: ContentScriptSignature[];
  resourceSignatures?: ResourceSignature[];
  linkSignatures?: LinkSignature[];
}
```

Each detector replaced its inline `const SIGNATURES = [...]` literal with
`const SIGNATURES = signaturesFor('<kind>')`. The `detect()` matching logic is
**byte-for-byte identical** — only the _source_ of the signatures moved.
Per-technology signature order is preserved (semantically meaningful for
`ScriptUrlDetector`/`ResourceDetector`/`LinkDetector`); cross-technology order
is normalized by `ScoringDetector#rank`. This is why moving signatures into the
catalog does **not** change final results.

## File layout (all under `packages/detectors/src`)

```
catalog/
  types.ts                       # relocated signature interfaces + TechnologyDefinition
  index.ts                       # TECHNOLOGY_DEFINITIONS, findDefinition,
                                 # signaturesFor(kind), validateCatalog/Definition/Definitions
  technologies/                  # one file per technology (54)
    <id>.ts                      # deterministic signature(s) for that tech
technology-catalog.ts            # REWRITTEN as a facade: derives
                                 # TECHNOLOGY_CATALOG / TECHNOLOGY_IDS /
                                 # TECHNOLOGY_CATEGORIES / getTechnology from the
                                 # definitions (public API preserved, throw
                                 # message "Unknown technology ID: ${id}" preserved)
index.ts                         # re-exports the catalog + validators + types
```

The six detectors (`header`, `meta-tag`, `script-url`, `content-script`,
`resource`, `link`) source `SIGNATURES` from `signaturesFor(<kind>)` and import
their signature _type_ from `catalog/types.ts`. `detect()` bodies are unchanged.

## Phase-by-phase execution (Phases 0–17 of `docs/Step68.md`)

| Phase | What                                                                        | Verification                                                                        |
| ----- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0     | Re-read Step 67 architecture & spec                                         | version.ts / Detection.version wired                                                |
| 1     | Audit existing 32-tech catalog + signatures                                 | signatures relocated verbatim                                                       |
| 2     | Design data-only expansion model (Option B)                                 | per-source optional arrays + `signaturesFor`                                        |
| 3     | Define `TechnologyDefinition` + relocate signature interfaces               | `catalog/types.ts`                                                                  |
| 4     | Create `catalog/technologies/*.ts` for the 32 migrated techs                | byte-identical signatures                                                           |
| 5     | Create `catalog/index.ts` (compose + validate + fail-fast guard)            | module-load throws on invalid def                                                   |
| 6     | Rewrite `technology-catalog.ts` as a facade                                 | public API + throw message preserved                                                |
| 7     | Wire 6 detectors to `signaturesFor`; `detect()` unchanged                   | typecheck GREEN                                                                     |
| 8     | Add 22 new tech fixtures + negative/near-miss fixtures                      | `detector-fixtures.ts`                                                              |
| 9     | Add realworld A–F corpus (multi-source)                                     | WP→100; Shopify+CF+GA; React+Next+Vercel; Vue+Nuxt; Drupal+Apache+PHP; static-empty |
| 10    | Extend collision tests for new techs                                        | `technology-collision.test.ts`                                                      |
| 11    | Refactor existing collision fixtures that now trigger new techs             | vercel/gtm added to `expected`                                                      |
| 12    | **Proof:** add Vercel (catalog file + fixture + test, no engine change)     | Vercel = `Server: vercel` sig only                                                  |
| 13    | Catalog validation guard tests                                              | `catalog-validation.test.ts`                                                        |
| 14    | Perf + determinism sanity                                                   | `catalog-performance.test.ts`                                                       |
| 15    | Version extraction for versioned new techs                                  | `technology-versions.test.ts`                                                       |
| 16    | Pre-existing G2 known-limitation evolution (GTM now detected, GA still not) | `realworld-audit.test.ts` G2                                                        |
| 17    | Full gate + commit                                                          | typecheck/eslint/prettier/vitest/build all green                                    |

## Technology reference (54)

The 22 **new** technologies (Phase 12 proof = `vercel`):

| id                   | name               | category  | sources                           | version rule                            |
| -------------------- | ------------------ | --------- | --------------------------------- | --------------------------------------- |
| `caddy`              | Caddy              | server    | header `Server` ∋ `caddy`         | `/caddy\/v?(\d+(?:\.\d+){0,2})/i`       |
| `openresty`          | OpenResty          | server    | header `Server` ∋ `openresty`     | `/openresty\/(\d+(?:\.\d+){0,3})/i`     |
| `litespeed`          | LiteSpeed          | server    | header `Server` ∋ `litespeed`     | —                                       |
| `tomcat`             | Apache Tomcat      | server    | header `Server` ∋ `apache-coyote` | `/apache-coyote\/(\d+(?:\.\d+){0,2})/i` |
| `fastly`             | Fastly             | cdn       | header `Via` ∋ `fastly`           | —                                       |
| `vercel`             | Vercel             | cdn       | header `Server` ∋ `vercel`        | —                                       |
| `typo3`              | TYPO3              | cms       | meta `generator` ∋ `typo3`        | —                                       |
| `joomla`             | Joomla             | cms       | meta `generator` ∋ `joomla`       | `/joomla!?\s+(\d+(?:\.\d+){0,2})/i`     |
| `craft-cms`          | Craft CMS          | cms       | meta `generator` ∋ `craft cms`    | `/craft\s+cms\s+(\d+(?:\.\d+){0,2})/i`  |
| `mediawiki`          | MediaWiki          | cms       | meta `generator` ∋ `mediawiki`    | `/mediawiki\s+(\d+(?:\.\d+){0,2})/i`    |
| `google-tag-manager` | Google Tag Manager | analytics | script `googletagmanager.com`     | —                                       |
| `matomo`             | Matomo             | analytics | script `matomo.js`                | —                                       |
| `segment`            | Segment            | analytics | script `cdn.segment.com`          | —                                       |
| `htmx`               | HTMX               | library   | script `htmx.org`                 | —                                       |
| `turbo`              | Turbo              | library   | script `@hotwired/turbo`          | —                                       |
| `stimulus`           | Stimulus           | library   | script `@hotwired/stimulus`       | —                                       |
| `alpinejs`           | Alpine.js          | library   | script `alpinejs`                 | —                                       |
| `bigcommerce`        | BigCommerce        | ecommerce | script `bcapp.com`                | —                                       |
| `d3`                 | D3                 | library   | script `d3.v`                     | `/d3\.v(\d+(?:\.\d+){0,2})/i`           |
| `popperjs`           | Popper.js          | library   | script `@popperjs`                | —                                       |
| `ember`              | Ember.js           | framework | inline content ∋ `ember.`         | —                                       |
| `backbone`           | Backbone.js        | framework | inline content ∋ `backbone.`      | —                                       |

The 32 **migrated** technologies (nginx, apache, iis, php, wordpress, drupal,
webflow, hugo, jekyll, ghost, express, laravel, nextjs, nuxtjs, gatsby, react,
vue, angular, svelte, astro, bootstrap, jquery, lodash, tailwind, firebase,
shopify, woocommerce, google-fonts, google-analytics, plausible, prestashop,
cloudflare) were relocated **verbatim** — no matching/signals changed.

Version rules already present on Step-67 techs (extracted through Step 67,
unchanged): nginx, apache, iis, php, wordpress, jquery, lodash. Every other
technology (new and migrated) is conservative: a signature with no version rule
yields `version === null` (never fabricated).

## Validation & test results

Full gate (run from repo root `C:\Dev\Projects/devlens`, pnpm workspaces):

| Check                                          | Result                                       |
| ---------------------------------------------- | -------------------------------------------- |
| `pnpm typecheck` (`tsc --noEmit`, 10 packages) | ✅ exit 0                                    |
| `pnpm exec eslint .` (whole repo)              | ✅ exit 0                                    |
| `pnpm exec prettier --check` (Step-68 files)   | ✅ All matched files use Prettier code style |
| `pnpm exec vitest run` (full repo)             | ✅ **1955 passed, 18 skipped, 0 failed**     |
| `pnpm build`                                   | ✅ exit 0                                    |

Vitest composition (detectors package, the Step-68 home):

| File                                                        | Tests                                     |
| ----------------------------------------------------------- | ----------------------------------------- |
| `golden-fixtures.test.ts`                                   | 268 (28 new fixtures × 3, incl. `vercel`) |
| `catalog-validation.test.ts`                                | 19 (new — Phase 13)                       |
| `technology-collision.test.ts`                              | 37 (+14 new-tech collision cases)         |
| `technology-versions.test.ts`                               | 8 (new — new-tech version extraction)     |
| `catalog-performance.test.ts`                               | 3 (new — Phase 14)                        |
| `realworld-audit.test.ts`                                   | 11 (G2 evolved)                           |
| `technology-catalog.test.ts`                                | 16 (32 → 54 techs)                        |
| `header/meta/script/content/resource/link-detector.test.ts` | unchanged                                 |
| …plus all pre-existing suites                               | unchanged                                 |

`packages/database/src/postgres-repository.test.ts` (16) and
`apps/web/src/app/api/scans/route.integration.test.ts` (2) remain **skipped**
with `DATABASE_URL` unset, as required.

### Catalog-coverage guarantee (golden `catalog coverage`)

- `ALL_TECH_IDS` is **derived** (`Array.from(TECHNOLOGY_IDS)`) from the catalog,
  so the coverage assertions can never drift from the catalog size (32→54 was a
  single mechanical change).
- Every catalog technology appears in at least one fixture's `expected`/`forbidden`.
- Every non-infrastructure technology has a fixture **named exactly `<id>`**
  (the 22 new `name`/`name`-matching fixtures, plus the 32 pre-existing ones).
- ≥2 negative fixtures and ≥2 coexistence fixtures are satisfied.

## Self-audit against non-negotiable constraints

| Constraint                                                             | Satisfied | Evidence                                                                |
| ---------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| Engine unchanged (`detect()` byte-identical)                           | ✅        | 6 detectors wire `signaturesFor` only; `ScoringDetector#rank` untouched |
| `confidence DESC, technology.id ASC` preserved                         | ✅        | `catalog-performance` determinism + ranking tests                       |
| Score `min(100, round(base + min(10,(n−1)·5)))`                        | ✅        | `realworld-audit` R1 WP=100, R2 scores                                  |
| `clampConfidence` (NaN→0, Inf→100)                                     | ✅        | `detection-scorer` / `confidence-integration` (unchanged)               |
| Confidence rendered without `%`                                        | ✅        | `@devlens/web` unchanged in this step                                   |
| No `if (technology === 'foo')` / no giant switch / no per-tech classes | ✅        | signatures are data; `switch` only in `signaturesFor(kind)`             |
| New tech = deterministic signature (no generic substrings)             | ✅        | each new sig is a strong, specific fingerprint                          |
| Phase-12 proof (declarative-only tech added)                           | ✅        | `vercel` — one catalog file + fixtures, zero engine/detector code       |
| Commit stages ONLY Step-68 code/tests/docs                             | ✅        | see commit section                                                      |

## Design decisions & known-limitations

- **GTM vs GA (G2 evolution).** The pre-existing `realworld-audit` G2 fixture
  loaded `googletagmanager.com/gtag/js` and was pinned to `toHaveLength(0)` as a
  "known gap." Adding `google-tag-manager` (fingerprint `googletagmanager.com`)
  would have broken that pin. The fingerprint is specific and **does not** match
  the `google-analytics` substring, so a GTM-only site is still not falsely
  reported as GA. G2 was therefore **evolved** to assert `google-tag-manager`
  is detected (90) while `google-analytics` remains undetected — the real gap
  (GA4-via-GTM not being attributed Analytics) is preserved honestly.
- **Vercel side-effect.** Three pre-existing Next.js fixtures carried
  `Server: vercel`; with Vercel now a technology those fixtures detect it as a
  side-effect. Since `vercel` was neither `expected` nor `forbidden` there, the
  subset/forbidden golden checks were unaffected; `vercel` was added to those
  fixtures' `expected` for honesty, and a dedicated `name: 'vercel'` positive
  fixture was added for catalog coverage.
- **Tomcat ↔ Apache.** A real Tomcat `Server: Apache-Coyote/<ver>` header
  _contains_ the substring `apache`, so Tomcat is always co-detected as Apache
  (Apache's version rule `/apache\/…/` does not match `apache-coyote`, so
  Apache's version stays `null`). This is inherent to Apache's broad substring
  signature and is documented by the `corpus-E` / `tomcat` fixtures.
- **OpenResty 4-part versions.** OpenResty versions are 4-part
  (`1.15.8.22`); the rule therefore permits up to 3 dot-groups (`{0,3}`) so the
  full version is captured, unlike the 3-part Step-67 rules (`{0,2}`).

## Limitations (explicit scope boundaries)

This step deliberately does **not** implement any of the following. Each is
explicitly out of scope for Step 68 (per `docs/Step68.md`, Phase 11 & Phase 17):

- **Browser runtime** — no Playwright, no headless browser, no DOM execution.
- **DOM inspection** — the in-memory DOM is not parsed or walked.
- **CSS runtime inspection** — no CSSOM, no computed-style analysis.
- **Cookies** unless already present in the existing snapshot — no new cookie
  collection.
- **DNS** — no host resolution or DNS-based detection.
- **TLS** — no TLS fingerprinting (JA3/JA4), no certificate inspection.
- **Favicon hashing** — no favicon MD5/SHA comparison.
- **Technology relationships** (`implies` / `requires` / `excludes`) — deferred
  to a future step (Step 66 identified this as future work). Colliding
  detections are resolved by signature specificity and ranking, not by
  relationships.
- **Large-scale external signature import** — no bulk import of third-party
  signature sets; all signatures are authored in-repo.

Adding a technology still requires a deterministic, in-snapshot observable
signature. Technologies with no such signature (e.g. Angular production builds —
see G1) are deliberately not detected.

## Future directions

Documented as possibilities, **not commitments**:

- **Technology relationships** (`implies`/`requires`/`excludes`) — once the
  declarative catalog is mature, a small relationship layer could express
  "WordPress implies PHP on the `X-Powered-By` header" without changing
  detectors. Deferring it let Step 68 prove the data-only model first.
- **Signature sources** — currently constrained to HTTP headers, meta tags,
  script URLs/content, links, and resources. Could be extended (still
  declaratively) to other already-captured observables if they exist.
- **Version coverage** — additional technologies could gain version rules as
  deterministic version signatures become apparent; the current approach is
  intentionally conservative (`version = absent` when no reliable rule exists).
- **Scale** — the catalog may grow well beyond 54; the `signaturesFor` accessor
  - `validateCatalog` fail-fast guard keep it manageable. No caching was added
    (Phase 14 found none needed).

## Commit

```
git add <Step-68 catalog + detectors + tests + docs/Step68-declarative-technology-expansion.md>
git commit -m "Step 68: Declarative Technology Signature Expansion"
```

Excluded (intentionally not staged): `.poolside/`, `settings.local.yaml`,
`.env*`, `docs/Step67.md`, `docs/Step68.md` (spec).
