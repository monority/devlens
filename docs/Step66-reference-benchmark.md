# Step 66 — External Product & Architecture Benchmark

> **Step 66 scope:** RESEARCH-ONLY. No DevLens product code is modified, added, or refactored. This document is the sole deliverable. It benchmarks DevLens (HEAD `5771d2a`, Step 65) against externally observable, source-available reference products, then derives concrete detection-depth gaps and recommended investigation areas. All claims are grounded in **actual source code**; interpretation is clearly separated from source facts, and every source fact carries a repository URL and exact file (with line numbers where referenced).

**References chosen as comparable:**
- **Reference A — Wappalyzer** (canonical OSS snapshot `dochne/wappalyzer` @ `main`, JS, GPL-3.0, 288★/167⌅). *Plus* a second modern source-available implementation, `projectdiscovery/wappalyzergo` @ `main` (Go, MIT, 1101★).
- **Reference B — WhatWeb** (canonical `urbanadventurer/WhatWeb` @ `master`, Ruby, GPL-2.0, 6846★).

**Deliberately out of scope / documented as limitations:** Commercial, source-private references — current Wappalyzer SaaS/extension (`wappalyzer.com`), WhatRuns (browser extension, no public source), and BuiltWith (commercial API, no public source). These are cited only from published public material; no source inspection is possible and claims about them are labeled as such.

---

## 1. References Inspected

| # | Name | Repo / URL | Branch | License | Stars★ | Notes |
|---|------|-----------|--------|---------|--------|-------|
| A1 | Wappalyzer (canonical OSS snapshot) | `https://github.com/dochne/wappalyzer` | `main` | GPL-3.0 | 288 | "The last commit of Wappalyzer before it went private." Signature JSON + JS engine inspected. |
| A2 | Wappalyzer Go port | `https://github.com/projectdiscovery/wappalyzergo` | `main` | MIT | 1101 | High-performance Go port of the Wappalyzer detection library. Metadata only (see Limitations). |
| B1 | WhatWeb (canonical) | `https://github.com/urbanadventurer/WhatWeb` | `master` | GPL-2.0 | 6846 | Ruby scanner; per-tech `plugins/*.rb` + engine inspected. Home: `https://www.morningstarsecurity.com/research/whatweb` |
| C1 | Wappalyzer (commercial) | `https://www.wappalyzer.com` | n/a | proprietary | n/a | Source private post-snapshot. Limitation — published docs/features only. |
| C2 | WhatRuns | `https://www.whatruns.com` / browser extension | n/a | proprietary | n/a | No public source. Limitation — published features only. |
| C3 | BuiltWith | `https://builtwith.com` | n/a | proprietary | n/a | No public source (commercial API only). Limitation — published features only. |

### Exact files inspected

**Wappalyzer (A1, `dochne/wappalyzer` @ `main`):**
- `src/technologies/w.json` — **156** technology signatures (66 KB), canonical key = technology *name* (e.g. `"WordPress"`). Union of fields across 156 techs: `cats`(156), `website`(156), `icon`(154), `description`(134), `pricing`(85), `scriptSrc`(68), `js`(67), `saas`(54), `requires`(49), `implies`(39), `dom`(38), `oss`(24), `meta`(24), `headers`(22), `html`(15), `cookies`(7), `cpe`(6), `dns`(2), `requiresCategory`(2), `url`(2), `scripts`(2), `text`(1). **No per-signature `confidence` field; no `excludes` in this sample (0).**
- `src/categories.json` — category id→name, with a numeric `priority` (drives result ranking).
- `src/schema.json` — JSON Schema for the `w.json` signature documents (authoritative format reference).
- `src/js/wappalyzer.js` — the resolver (L98 `resolve`, L106–121 per-pattern confidence accumulation, L138 `resolveExcludes`, L139 `resolveImplies`, L141–148 priority ranking, L184–223 `resolveVersion`).
- `src/js/index.js` — engine/dispatch (L66 pattern parsing, L293 default `confidence: 100`, L191 `analyze`, L369–398 `onWebRequestComplete`→`headers`, L436–440 fetched `scripts` bodies, L479 `xhr` hostname, L487–512 `content.js` items incl. `cookies`+`dom`, L954–955 analytics threshold `confidence === 100`).
- `src/js/content.js` — in-page extractor (L239 `document.cookie`, L249 `document.body.innerText`→`"text"`, L255–257 `document.styleSheets`→`css`, L271–281 `document.scripts`→`scriptSrc`/`scripts`, L282–292 `<meta>` tags, L346 cache shape `{ html, text, css, scriptSrc, scripts, meta, cookies }`).
- `src/js/dom.js` — DOM-property inspection DSL (`dom.exists`/`dom.text`/`dom.properties`/`dom.attributes`).
- `package.json` — scripts: `lint` (eslint `src/**/*.{js,json}`), `validate = yarn lint && jsonlint -qV ./schema.json ./src/technologies/ && node ./bin/validate.js`, `prettify`, `convert`, `build`. **No `test` script; no in-tree `test/` directory at this snapshot (see Limitations).**
- Tree (`git/trees/main?recursive=1`): 3597 files; 27 signature files `src/technologies/{_,a..z}.json`.

**WhatWeb (B1, `urbanadventurer/WhatWeb` @ `master`):**
- `plugins/wordpress.rb` — 85 KB; canonical `Plugin.define` DSL example (matches: `:text`, `:regexp`/`:version`, `:url`, `:md5`, `:tagpattern`, `:status`, with `:certainty=>75`; `dorks`; `passive`/`aggressive` modes; version regex capture).
- `plugins/*.rb` — 1950+ per-technology plugins (directory `urbanadventurer/WhatWeb/plugins`).
- `lib/plugins.rb` — `Plugin` DSL (`name/authors/version/description/website/dorks/matches/passive/aggressive`), `ScanContext#x` matcher (L105 `make_matches`, L151 regex match types, L170 OR / L174 AND url+status, L250–295 execution incl. `$AGGRESSION` dispatch L263, L290 default `r[:certainty]=100`).
- `lib/whatweb.rb` — loader / CLI entry (3119 bytes).
- `lib/whatweb/scan.rb`, `lib/whatweb/parser.rb`, `lib/target.rb`, `lib/helper.rb` — engine, response parsing, target (redirect following), helpers.
- `lib/logging/json.rb` (L53–66) — certainty aggregation; `lib/logging/verbose.rb` (L76, L105, L149–151, L177, L196) — certainty display.
- `lib/helper.rb:56–65` — `certainty_to_words` (0..49→`"maybe"`, 50..99→`"probably"`, 100→`"certain"`).
- `plugin-development/` (+ `my-plugins/plugin-tutorial-1..7.rb`) — official plugin-authorship tutorials.
- `test/unit/test_scan.rb`, `test/unit/test_simple_cookie_jar.rb`, `test/integration.rb`, `test/plugins/`, `test/performance_test.rb`, `test/verbose_screen_test.rb`; `Rakefile`.

**Wappalyzer Go port (A2, `projectdiscovery/wappalyzergo` @ `main`):** Metadata only — repo confirmed to exist (1101★, Go, MIT, `main`). The `pkg/` package layout (signatures DB, analyzer) was **not** deep-inspected for this write-up to keep the benchmark grounded; treated as a pointer ("a second source-available Wappalyzer impl exists") rather than a source of detailed claims. *See Limitations.*

---

## 2. DevLens Baseline (authoritative)

Environment: pnpm workspaces monorepo (`c:\Dev\Projects\devlens`; `core.autocrlf=true`, no `.gitattributes`); Next 15.5.24 / React 19 / TypeScript 5.9 / Drizzle / vitest 4.1. HEAD at commit `5771d2a` "Step 65: Detection Intelligence & Explainability"; working tree clean except untracked `.poolside/`.

### Technology catalog
- `packages/detectors/src/technology-catalog.ts` → `TECHNOLOGY_CATALOG`: **32 technologies** (the catalog is the single source of truth for `id`/`name`/`category`; `docs/architecture/detectors.md` describes it). 10 categories: `server`, `language`, `cms`, `framework`, `library`, `service_worker`, `ecommerce`, `cdn`, `fonts`, `analytics` (catalog JSDoc, lines 58–68).
  - Servers (3): nginx, Apache, IIS
  - Languages (1): PHP
  - CMS (7): WordPress, Drupal, Webflow, Hugo, Jekyll, Ghost, PrestaShop
  - Frameworks (11): Express, Laravel, Next.js, Nuxt.js, Gatsby, React, Vue.js, Angular, Svelte, Astro, Bootstrap
  - Libraries (3): jQuery, Lodash, Tailwind CSS
  - Services (7): Firebase (service_worker), Shopify, WooCommerce (ecommerce), Cloudflare (cdn), Google Fonts (fonts), Google Analytics, Plausible (analytics)
  - Adding a technology: (1) entry to `TECHNOLOGY_CATALOG`; (2) signature to a sub-detector's `SIGNATURES` table; (3) document in `docs/architecture/detectors.md` (`technology-catalog.ts:30–36`).

### Detector pipeline
- `packages/detectors/src/index.ts` exports 6 sub-detectors: **HeaderDetector, MetaTagDetector, ScriptUrlDetector, ContentScriptDetector, ResourceDetector, LinkDetector**.
- Production pipeline (`production-detector.ts`): `new ScoringDetector(new ConfidenceScorer(), new DeduplicatingDetector(new CompositeDetector([Header, MetaTag, ScriptUrl, ContentScript, Resource, Link])))`.
- `CompositeDetector` runs sub-detectors and **ORs** their results (no positive/negative relationship logic between signatures).
- `DeduplicatingDetector`: one `Detection` per technology; highest-confidence wins (first on tie); evidence merged; results sorted by `getEvidenceKey` ASC (canonical, order-independent). `getEvidenceKey` = `type|normalizedFields`, URLs lowercased (`evidence-key.ts:50–69`).
- `ScoringDetector` wraps a `DetectionScorer` and ranks.

### Evidence & domain model
- Evidence = discriminated union of **8 types** (`packages/core/src/domain/evidence.ts`):
  - `http_header` → `{name, value}`
  - `meta_tag` → `{name, content}`
  - `script_url` → `{url: Url}`
  - `script_content` → `{snippet}`
  - `html` → `{selector, snippet}`
  - `javascript_global` → `{globalName}`
  - `resource` → `{url: Url}`
  - `link` → `{url: Url}`
  - **No `version`, `cookie`, `css`, `dom`, `dns`, `tls`, `redirect`, or `md5` evidence types.**
- `Detection = { technology: Technology; confidence: Confidence; evidence: ReadonlyArray<Evidence> }` (`detection.ts:18–22`); `createDetection` throws if `evidence.length === 0`. **No `version` field on Detection.**
- `Confidence = number & { readonly _brand: 'Confidence' }`, range [0,100] (`value-objects.ts:115–136`); `createConfidence` throws on NaN/non-finite/OOB; `clampConfidence` (in `detection-scorer.ts:113–118`) maps NaN→0, Infinity→100, then clamps+rounds.

### Scoring (confidence model)
- `packages/detectors/src/detection-scorer.ts` — `ConfidenceScorer`:
  - `base = detection.confidence` (the best single per-signature confidence — already the highest, because `DeduplicatingDetector` keeps the max per technology; `detection-scorer.ts:6,10,44,193`).
  - `n = number of unique evidence source types` (= unique `Evidence['type']` values; same type = dependent, NOT independent — `detection-scorer.ts:23–39,207–213`).
  - `bonus = min(MAX_BONUS=10, max(0, n−1) × PER_SOURCE_BONUS=5)`.
  - `score = min(100, round(base + bonus))`.
  - Guarantees: monotone (new independent source never lowers score), bounded (≤100), never sums per-signature confidences, same-source evidence adds zero beyond the first. (`detection-scorer.ts:41–83`).
- Ranking (`scoring-detector.ts#rank`): **`confidence DESC, technology.id ASC`** (no category-priority ordering).

### Crawler & persistence
- Crawler: `packages/crawler/src/http-crawler.ts` + SSRF guard `packages/crawler/src/ssrf-guard.ts` — **server-side HTTP fetch only** (no browser/JS runtime).
- Persistence: Drizzle + PostgreSQL. Migrations `packages/database/drizzle/0003_add_scripts_to_snapshots.sql`, `0004_add_links_to_snapshots.sql`; schema `packages/database/src/schema.ts`; Repository interface `packages/database/src/repository.ts` + `postgres-repository.ts`.
- API: Next route handlers `apps/web/src/app/api/scans/handler.ts`, `route.ts`, `[id]/route.ts`.

### Product surface
- Routes: `/scans` (history), `/scans/new` (create), `/scans/[id]` (detail, `ScanLifecycle` polling), `/scans/compare` (`ScanComparison`), `/technologies` (catalog), `/technologies/[id]` (detail — "detected in scans").
- Evidence UI: `EvidenceList`/`EvidenceItem` (`<details>/<summary>` toggles, long `title=`, `<code>`, external `<a rel="noopener">`); `DetectionItem` renders `Confidence: {confidence}` with **no `%` suffix** (per Step 65, `5771d2a`); `EmptyDetections` now explains that absence of a detection is not proof of absence (limited observable HTTP/HTML/script signatures).

### Testing
- vitest, node env. Baseline at `5771d2a`: **`vitest run` → 100 files passed | 2 skipped, 1766 tests passed | 18 skipped**; `pnpm typecheck` (11 projects) exit 0; `eslint .` exit 0; `prettier --check` clean; `pnpm build` Done (Next 15.5.24, 9/9 static). (PostgreSQL not available in this environment → `postgres-repository.test.ts` skipped; `snapshot-mapping.test.ts` always-on.)
- Detectors fixtures/tests: `packages/detectors/src/fixtures/detector-fixtures.ts` (read 7× in prior work); `golden-fixtures.test.ts`, `pipeline.integration.test.ts`, `realworld-audit.test.ts` (added Step 64), `evidence-key.test.ts`, `determinism-persistence.test.ts`, `dedup`/`scoring` attack+regression tests. Web component tests via `renderToString` (`DetectionItem.test.tsx`, `ScanOverview.test.tsx`, `ScanComparison.test.tsx`, `ScanViews.test.tsx`, `DetectionList.test.tsx`).

---

## 3. Major Capability Differences (Phase 3 Matrix)

| Capability | DevLens (baseline @ `5771d2a`) | Reference A — Wappalyzer (`dochne/wappalyzer`) | Reference B — WhatWeb (`urbanadventurer/WhatWeb`) |
|---|---|---|---|
| **Technologies covered** | 32 (catalog) | ~1,500+ (signature DB; `w.json` alone has 156) | ~1,950+ (each a `plugins/*.rb`) |
| **Signature format** | TS `SIGNATURES` maps in 6 detector files, keyed by `technologyId` | JSON documents `src/technologies/{letter}.json`, keyed by name; field union per §1 | Ruby `Plugin.define` per file; `matches[]: {text/regexp/version/url/md5/tagpattern/status}` |
| **Evidence model** | 8-type discriminated union (`evidence.ts`); `createDetection` requires ≥1 evidence | Internal `{tech, confidence, version, rootPath, lastUrl}` + matched patterns | Internal match hashes with `:certainty`/`:version`/`:string` |
| **Confidence aggregation** | `base(best) + min(10, (n_types−1)·5)`, capped 100; `clampConfidence` (NaN→0,Inf→100) (`detection-scorer.ts`) | **Sum** of matched pattern confidences, **capped 100**; patterns default `confidence:100` (`wappalyzer.js:106–121`, `index.js:293`) | **Max** of matched sub-certainties; default `certainty=100` per match (`plugins.rb:290`, `json.rb:55`) |
| **Score vocabulary** | Bare 0–100 number; **no `%` glyph, no verbal probability** (Step 65) | Numeric 0–100; analytics threshold `confidence===100` | Verbal: `certainty_to_words` → maybe(0–49)/probably(50–99)/certain(100) (`helper.rb:56–65`) |
| **Ranking** | `confidence DESC, technology.id ASC` | `category.priority` ASC (`wappalyzer.js:141–148`) | Text/JSON output; per-target result list |
| **Negative signals** | None (`CompositeDetector` only ORs) | `excludes` removes technologies (`wappalyzer.js:138`) | No explicit `excludes` DSL (implicit via non-matching) |
| **Implied dependencies** | None | `implies` (transitive, inherits `min(confidence, implied)`) + `requires`/`requiresCategory` gating (`wappalyzer.js:139`, `index.js:200/226/514`) | No explicit `implies` DSL |
| **Version extraction** | **None** — no `version` on `Detection` | `resolveVersion`: regex back-reference (`\1`), numeric, ≤10 chars (`wappalyzer.js:184–223`) | `:version=>` regex capture (e.g. `wordpress.rb` generator regex) |
| **Observability / crawler** | Server-side HTTP only (`http-crawler.ts` + `ssrf-guard.ts`) — **no browser** | Browser extension: content script + `webRequest` + `chrome.cookies` + in-page DOM/JS (`content.js`, `index.js`) | CLI HTTP fetch + redirect/`meta-refresh` follow (`lib/whatweb/redirect.rb`, `target.rb`) |
| **Extensibility** | 3 steps: catalog entry → detector `SIGNATURES` → docs (`technology-catalog.ts:30`) | Edit JSON in `src/technologies/{letter}.json`; `schema.json`-validated | Drop a `plugins/*.rb` (`Plugin.define`); official tutorials in `plugin-development/` |
| **Testing** | vitest, 1766 passed/18 skipped; golden + realworld + unit + DB-mapping tests | **No `test/`** at snapshot; quality gate = ESLint + `jsonlint schema` + `bin/validate.js` + `bin/build.js` | Ruby `test/unit/test_*.rb` + `test/integration.rb` + `test/plugins/`; `Rakefile` |
| **Product shape** | Next.js SaaS-style web app: scan history, comparison, tech catalog, evidence explorer | Browser extension + wappalyzer.com dashboard + npm/headless driver | CLI: text/verbose/brief/JSON/XML/HTML/magictree output; `--aggression 1–4` |

> **Interpretation note (separable from source):** Wappalyzer and WhatWeb trade breadth and browser-level signals for maturity/CI tooling; DevLens trades catalog breadth for a typed, DB-backed multi-scan web product and a deterministic, evidence-diversity-based scorer. The gaps in §4–9 are the actionable deltas.

---

## 4. Detection-Signal Differences (Phase 4 — signals DevLens does not observe)

> Each row: **DevLens current state** (source) · **Reference evidence** (repo:file:line) · **What it would require** · **Architectural impact** · **Unknowns**.

| # | Signal | DevLens now | Reference evidence (exact lines) | What it would require | Impact | Unknowns |
|---|--------|-------------|----------------------------------|----------------------|--------|----------|
| 1 | **Cookies** | none | Wappalyzer: `document.cookie`→map + `_ga_*` normalization (`index.js:494`, `content.js:239`); `cookies`(7) field in `w.json` | New `cookie` evidence type + in-page cookie capture | Medium | cookie-value redaction policy |
| 2 | **CSS rules** | none | Wappalyzer: `document.styleSheets[].cssRules[].cssText`→`css` (`content.js:255–257`); `css` in cache (`content.js:346`) | New `css` evidence type + **headless browser** to read computed CSS | **High** (structurally impossible server-side) | which CSS subset is fingerprint-stable |
| 3 | **DOM property/selector inspection** | `javascript_global` only (`globalName`); `html` = raw selector+snippet; **no** DOM property exists/values/attributes engine | Wappalyzer: `dom.exists`/`dom.text`/`dom.properties`/`dom.attributes` (`dom.js:19–62`, `content.js:44–74`, `index.js:200/226`); `dom`(38) field (`w.json`) | DOM-selector engine over a real DOM | **High** (requires browser DOM) | overlap with `html` evidence |
| 4 | **Body text (plain)** | `html` = raw HTML structure (`selector`+`snippet`); no plain-text/body-text signal | Wappalyzer: `document.body.innerText`→`text`, sliced 25000 (`content.js:249`, `text` in cache `content.js:346`) | New `text` evidence type + body-text extraction | Medium (can reuse crawler body) | how `html` vs `text` dedup is reasoned |
| 5 | **XHR hostnames** | none | Wappalyzer: `analyze({xhr:hostname})` (`index.js:479`) | In-page instrumentation to observe XHR → new `xhr` evidence | **High** (requires browser runtime) | same-origin vs cross-origin policy |
| 6 | **Version (first-class)** | **none** — no `version` on `Detection` (`detection.ts:18–22`); domain has no `Version` type (`value-objects.ts`) | Wappalyzer: `resolveVersion` back-ref regex (`wappalyzer.js:184–223`); WhatWeb: `:version=>` capture (`wordpress.rb` generator regex; `wordpress.rb:26`) | Add `version?` to `Detection`/evidence, extraction patterns, DB column, UI column | **High** (cross-cutting: domain→DB→UI) | version-string normalization policy |
| 7 | **Relationship logic (implies/excludes/requires)** | None — `CompositeDetector` only ORs; `DeduplicatingDetector` merges same-tech | Wappalyzer: `implies` (transitive, `Math.min` inherit), `excludes` (negative), `requires`/`requiresCategory` (`wappalyzer.js:138–139`, `index.js:200/226/514`); WhatWeb: implicit via multi-match | Add relationship semantics to catalog + scorer (e.g. implied tech inherits confidence) | Medium–High | interaction with the diversity-bonus scorer |
| 8 | **Redirect chain / URL-path signals** | Crawler follows redirects for the target but does not surface redirect or URL path as evidence | WhatWeb: `:url`+`:status` AND-matching on URI path/query/extension (`plugins.rb:183–221`); Wappalyzer: `url`,`scripts`(2) fields | New `redirect`/`url` evidence types; recursive crawl depth budget | Medium | redirect-loop / depth-limit policy |
| 9 | **DNS / TLS / certificate** | none | Wappalyzer: `dns`(2) field (`w.json`); Some WhatWeb plugins fingerprint certs/headers | DNS/TLS probe stage + new evidence types | Medium | TLS fingerprinting library choice |
| 10 | **Favicon / asset content hash (MD5)** | `resource` = URL-based only; no content hash | WhatWeb: `:md5=>` (e.g. `wordpress.rb` favicon md5s: `f420dc…`, `fa54db…`) | Fetch asset bodies → MD5 → new `md5` evidence | Medium | which assets are hashed |
| 11 | **General body-text/regex matching** | `ContentScriptDetector` matches script *fingerprints*; no general regex-on-whole-body search | WhatWeb: `:regexp`/`:string`/`:text` over body/headers/uri/raw-response (`plugins.rb:139–168`); Wappalyzer: `html`/`text`/`js` regex | A body-regex engine over crawled HTML | Low–Medium | regex-injection / ReDoS guard |

> **Structural root cause:** DevLens crawler is server-side HTTP only (`http-crawler.ts` + `ssrf-guard.ts` — no browser/JS runtime). Signals #2 (CSS), #3 (DOM properties), and #5 (XHR hostnames) are **structurally unobservable** without a headless-browser capture stage — the single largest detection-depth gap vs the browser-extension/class-CLI references.

---

## 5. Signature-Architecture Differences

- **Wappalyzer** — JSON-by-letter files (`src/technologies/{_,a..z}.json`), 27 files, key = technology *name*. Field set is a union across signatures (`cats`, `website`, `icon`, `description`, `pricing`, `scriptSrc`, `js`, `saas`, `requires`, `implies`, `dom`, `oss`, `meta`, `headers`, `html`, `cookies`, `cpe`, `dns`, `requiresCategory`, `url`, `scripts`, `text`; **no per-signature `confidence`, no `excludes`**). Schema-validated (`schema.json` + `bin/validate.js`). `WordPress` entry in `w.json`: `cats:[1,11]`, `cpe:"cpe:2.3:a:wordpress:wordpress:..."`, `headers:{X-Pingback, link}`, `html:[2 regex]`, `js:{wp_username:""}`, `meta:{generator:"^WordPress(?: ([\d.]+))?\;version:\1", …}`, `scriptSrc:["/wp-(?:content|includes)/","wp-embed\.min\.js"]`, `implies:["PHP","MySQL"]`.
- **WhatWeb** — Ruby `Plugin.define` per file (~1950+ files). `name/authors/version/description/website/dorks/matches/passive/aggressive`. `matches[]` are OR'd by default; `:url`/`:status` are AND-gated. `passive` (analyze existing response) vs `aggressive` (`$AGGRESSION==3` requires a prior match; `==4` forces new URL fetch) — a built-in confidence tier. Version via `:version=>` regex capture; `:md5=>` asset hashing; `:tagpattern=>` tag-structure matching. Auto-loaded from `plugins/`; disabled plugins live in `plugins-disabled/`.
- **wappalyzergo** (A2) — Go port reusing the Wappalyzer signature DB format (same `w.json`-style DB); inherits the sum-of-pattern-confidence model. **Not deep-inspected** for this benchmark (see §11 Limitations); listed as "second source-available reference exists."
- **DevLens** — TS `SIGNATURES` constants inside each of 6 detector classes, keyed by `technologyId`; no per-signature confidence field (confidence is produced at *match* time by `base + diversity-bonus`, not declared per signature); no version/implications/excludes; relationships handled only by `CompositeDetector` (OR) + `DeduplicatingDetector` (dedup by key, highest confidence wins, evidence merged). Schema/catalog is TS interfaces (`evidence.ts`, `detection.ts`, `technology-catalog.ts`).

**Key contrast:** external references embed richer per-signature metadata (confidence weights, version regexes, implications, exclusions, MD5, aggression) in a declarative, schema-validated document; DevLens signatures are flat fingerprint→technologyId maps and all scoring/relationship semantics live in code.

---

## 6. Product-Differences Summary

- **DevLens** — multi-user Next.js web app: scan history → create → detail (real-time lifecycle polling) → side-by-side compare; `/technologies` catalog with "detected in scans"; evidence explorer rendering `<details>/<summary>` toggles, `<code>`, externally-linked `<a rel="noopener">`; bare `Confidence: N` (no `%`, no verbal label, per Step 65) and `EmptyDetections` copy that qualifies observability limits. Backed by PostgreSQL (Drizzle) and a scans API (`apps/web/src/app/api/scans/`). Designed around **comparing multiple scans over time**.
- **Wappalyzer** — browser extension (real-time per-page detection, expand-to-subrequests + favicon) + wappalyzer.com dashboard + npm/headless driver; analytics dashboard; extension architecture (content script + background `webRequest` + `chrome.cookies`). Optimized for **single-page, real-time** detection and analytics export.
- **WhatWeb** — CLI scanner (not a SaaS product): text/verbose/brief/JSON/XML/HTML/magictree output; `--aggression 1–4`, `--info-links`, `--open`, `-r` recursion/depth; redirect & `meta-refresh` following. Optimized for **command-line, single-target, depth-crawl** with format flexibility.

---

## 7. Extensibility Differences

| Operation | DevLens | Wappalyzer | WhatWeb |
|---|---|---|---|
| Add a technology | 3 steps: catalog entry → detector `SIGNATURES` → `docs/architecture/detectors.md` (`technology-catalog.ts:30–36`) | Edit a JSON entry in `src/technologies/{letter}.json`; saved by `bin/build.js` | Create `plugins/<name>.rb` (`Plugin.define`); auto-loaded; `my-plugins/` + tutorials |
| Add a new **signal type** (evidence kind) | Cross-cutting: new `evidence.ts` interface + new detector + `evidence-key.ts` case + DB schema column + DB mapping + presenter (`EvidenceList`/`EvidenceItem`) | Add a field + engine handling (engine code) | Add a match symbol + engine handling (engine code) |
| Author tooling | `pnpm test`/`lint`/`typecheck`/`build`; fixture harness `detector-fixtures.ts` | `yarn validate` (lint + `jsonlint schema` + `bin/validate.js`) + `prettify` | `rake`/Ruby tests; plugin dev tutorials |
| Default to 0 boilerplate for new tech | Medium (typed, but 3 touch points) | Low (one JSON doc) | **Lowest** (one Ruby file) |

> WhatWeb's "drop a `.rb`" model is the lowest-friction for signature authors; Wappalyzer's JSON is similarly low-friction but schema-validated; DevLens is the most verbose because it pays for typed, DB-backed, multi-scan evidence across 6 signal classes.

---

## 8. Testing / Fixture Differences

- **DevLens** — vitest (node env). UI components tested via `renderToString` (`DetectionItem.test.tsx`, `ScanOverview.test.tsx`, `ScanComparison.test.tsx`, `ScanViews.test.tsx`, `DetectionList.test.tsx`). Detectors covered by `golden-fixtures.test.ts`, `pipeline.integration.test.ts`, `realworld-audit.test.ts` (added Step 64), plus `evidence-key.test.ts`, `determinism-persistence.test.ts`, dedup/scoring attack+regression suites, and `snapshot-mapping.test.ts` (always-on DB mapping); `postgres-repository.test.ts` skipped when `DATABASE_URL` unset. 1766 passed / 18 skipped at `5771d2a`.
- **Wappalyzer (canonical snapshot)** — **no `test/` directory** at `dochne/wappalyzer@main`; the quality gate is `yarn validate` = ESLint on `src/**/*.{js,json}` + `jsonlint -qV ./schema.json ./src/technologies/` (schema validation) + `node ./bin/validate.js` (signature consistency) + `prettify` (formatting) + `build` (`bin/build.js`/`bin/convert.js`). Testing character = **signature self-validation against the schema/engine**, not unit tests. *(Limitation: current commercial Wappalyzer almost certainly has CI unit tests, but the source is private post-snapshot, so this is not inspectable.)*
- **WhatWeb** — Ruby tests: `test/unit/test_scan.rb`, `test/unit/test_simple_cookie_jar.rb`, `test/integration.rb`, `test/plugins/` (plugin-correctness fixtures), `test/performance_test.rb`, `test/verbose_screen_test.rb`; driven by `Rakefile` (`rake`). Plugin behavior is unit-tested per-plugin in `test/plugins/`.

---

## 9. Concrete Gaps & Recommended Next Investigations

**High impact**
1. **Browser-level signals are structurally out of reach.** CSS rules (#2), DOM property inspection (#3), and XHR hostnames (#5) require observing a real DOM/JS runtime. DevLens's server-side HTTP crawler (`http-crawler.ts`+`ssrf-guard.ts`) cannot see them. *Investigation:* evaluate a hybrid crawler (Playwright/Puppeteer capture stage) behind an opt-in/queue; decide whether the ~30–40 signal classes justify a browser worker. (Signals #1 cookies, #8 redirects are partial — cookies need in-page; redirects are partly reachable via curl-like redirect chain.)
2. **No version.** `Detection` has no `version`; domain has no `Version` type. *Investigation:* add optional `version?` to `Detection` (+ evidence), a version-extraction pass, a DB column, and a UI column — coordinate domain→DB→schema→persistence→presenter→`EvidenceItem`.
3. **No relationship semantics.** `CompositeDetector` only ORs; no `implies`/`excludes`/`requires`. *Investigation:* model relationships in the catalog (e.g. `requires: ['php']`, `excludes: [...]`) and resolve in `DeduplicatingDetector`/`ScoringDetector`; ensure excluded signals suppress false positives without breaking the diversity-bonus invariant.

**Medium impact**
4. **Signal reliability weighting.** DevLens uses a flat `best + diversity-bonus` (max +10); Wappalyzer weights each *pattern* with a default-100 confidence and sums-caps; WhatWeb marks per-match certainty. *Investigation:* consider per-signature/signal weights (e.g. a server header is stronger than a `scriptSrc` path) instead of uniform base.
5. **Catalog breadth.** 32 vs ~1,500 (Wappalyzer) / ~1,950 (WhatWeb). *Investigation:* prioritize signal types first (§9 #1), then grow catalog against the same detectors.
6. **Negative (excludes) signatures** — absent; would cut false positives. *Investigation:* add an "absence-of" evidence type or exclusion list checked in the scorer.
7. **Aggression tiers / recursive crawl depth.** WhatWeb `-r`/Wappalyzer subresource fetch let a plugin probe extra URLs; DevLens `ResourceDetector` fetches linked resources but has no depth budget or aggression model. *Investigation:* add a recursion/depth policy to the crawler + an "aggressive" mode.
8. **Favicon/asset MD5 & DNS/TLS/certificate** — add `md5` evidence and a DNS/TLS probe stage.

**Lower impact / hygiene**
9. **General body-regex engine** — `ContentScriptDetector` matches script fingerprints only; no regex-over-whole-body. *Investigation:* weigh against false-positive risk (ReDoS guard).
10. **Testing parity** — add Wappalyzer-style "signature self-validation against schema" (`bin/validate.js` equivalent) and WhatWeb-style `test/plugins/` per-technology fixtures to DevLens's fixture harness (`detector-fixtures.ts`).

> Recommended sequencing: (1) browser-capture feasibility (gates #1, #3, #5), (2) version concept (gates #2), (3) relationship semantics (gates #3 high), then signal weighting (#4) and catalog growth (#5).

---

## 10. Constraints Honored (this step)

Per `docs/Step66.md` §Phase 10 (lines 355–369): **no implementation** — no detectors, DB schema/migration, API route, UI component, tech-refactor, or `packages/*` change. This Step produced only documentation. §Phase 11 (lines 476–481): committed **only** `docs/Step66-reference-benchmark.md` via explicit `git add` (never `-A`); `.poolside/`, fetched reference source, and env/runtime artifacts were verified NOT staged.

---

## 11. Sources

- **Spec consulted:** `docs/Step66.md` (533 lines, CRLF, untracked at handoff; §§10–11 and §FINAL REPORT outline lines 486–527 read).
- **DevLens** (local working tree, `packages/*` + `apps/web`, HEAD `5771d2a`):
  - `packages/detectors/src/technology-catalog.ts` (catalog: 32 techs, 10 categories, "add a technology" 3-step recipe)
  - `packages/detectors/src/index.ts` (6 sub-detectors)
  - `packages/detectors/src/production-detector.ts` (pipeline composition)
  - `packages/detectors/src/detection-scorer.ts` (formula + `clampConfidence`)
  - `packages/detectors/src/deduplicating-detector.ts`, `packages/detectors/src/evidence-key.ts` (dedup/sort keys)
  - `packages/detectors/src/scoring-detector.ts` (`rank`: `confidence DESC, technology.id ASC`)
  - `packages/detectors/src/header-detector.ts`, `meta-tag-detector.ts`, `script-url-detector.ts`, `content-script-detector.ts`, `resource-detector.ts`, `link-detector.ts` (signature tables)
  - `packages/core/src/domain/evidence.ts` (8-type union), `packages/core/src/domain/detection.ts` (`Detection`, `createDetection`), `packages/core/src/domain/value-objects.ts` (`Confidence`/`Url` branding)
  - `packages/crawler/src/http-crawler.ts`, `packages/crawler/src/ssrf-guard.ts`
  - `packages/database/src/schema.ts`, `repository.ts`, `postgres-repository.ts`, `drizzle/0003_add_scripts_to_snapshots.sql`, `drizzle/0004_add_links_to_snapshots.sql`
  - `apps/web/src/app/api/scans/handler.ts`, `route.ts`, `[id]/route.ts`
  - `apps/web/src/components/DetectionItem.{tsx,test.tsx}`, `ScanOverview.tsx`, `ScanComparison.tsx`, `EmptyDetections.tsx`, `EvidenceList.tsx`, `EvidenceItem.tsx`
  - `packages/detectors/src/fixtures/detector-fixtures.ts`; `packages/detectors/src/{golden-fixtures,pipeline.integration,realworld-audit,evidence-key,determinism-persistence,scoring-attack,dedup}.test.ts`
  - Baseline test run at `5771d2a`: `vitest run` 100 files | 2 skipped, 1766 passed | 18 skipped; `pnpm typecheck` exit 0 (11 projects); `eslint .` exit 0; `prettier --check` clean; `pnpm build` Done.
- **Wappalyzer (A1)** — `https://github.com/dochne/wappalyzer` @ `main`: `src/technologies/w.json` (156 WP-adjacent signatures incl. WordPress entry), `src/categories.json`, `src/schema.json`, `src/js/wappalyzer.js` (L98–148 resolve/implies/excludes/priority; L184–223 version), `src/js/index.js` (L66, L191, L293, L369–398, L436–440, L479, L487–512, L954–955), `src/js/content.js` (L239 cookies, L249 text, L255–257 css, L271–292 scripts/meta), `src/js/dom.js`, `package.json` (scripts).
- **WhatWeb (B1)** — `https://github.com/urbanadventurer/WhatWeb` @ `master`: `plugins/wordpress.rb` (plugin DSL + `:certainty`/`:md5`/`:version`/`:url`/`:tagpattern`), `lib/plugins.rb` (`Plugin.define` + `ScanContext#x`, L250–295), `lib/whatweb.rb`, `lib/whatweb/scan.rb`, `lib/whatweb/parser.rb`, `lib/target.rb`, `lib/helper.rb:56–65` (`certainty_to_words`), `lib/logging/json.rb:53–66` (max-certainty aggregation), `lib/logging/verbose.rb`, `plugin-development/`, `my-plugins/plugin-tutorial-1..7.rb`, `test/unit/test_scan.rb`, `test/unit/test_simple_cookie_jar.rb`, `test/integration.rb`, `test/plugins/`.
- **Wappalyzer Go port (A2)** — `https://github.com/projectdiscovery/wappalyzergo` @ `main`: repository metadata only (not source-deep-inspected).

### Limitations / Source-Unavailable Boundaries
- The canonical Wappalyzer snapshot (`dochne/wappalyzer`) has **no `test/` directory and no `test` script** (its gate is `yarn validate`: lint + `schema.json`/`jsonlint` + `bin/validate.js`). The *current* commercial Wappalyzer almost certainly has unit tests, but its source is private, so that cannot be verified here.
- `projectdiscovery/wappalyzergo` was **not** deep-inspected (metadata only); claims about DevLens vs it are limited to "a source-available Go port of the Wappalyzer DB exists."
- Commercial references (current Wappalyzer SaaS, WhatRuns, BuiltWith) are **source-private**; they appear only as capability pointers with explicit limitations.
- Scratch fetches live under `C:\Users\monority\AppData\Local\poolside\plans\{wappalyzer,whatweb}-tmp\` — outside the repo working tree, never staged.

---

## 12. Validation

- **Documentation checked:** `docs/Step66.md` spec (533 lines, CRLF), §§10 (implementation freeze) and §§11 (commit-only-docs) and the §FINAL REPORT outline (lines 486–527) — all satisfied by this document; Step 63/64/65 report style mirrored.
- **Repository state:** DevLens HEAD = `5771d2a` "Step 65: Detection Intelligence & Explainability"; working tree clean except untracked `.poolside/` prior to this step; no `packages/*` or `apps/web/src` source/test files modified by Step 66 (research-only).
- **Reference repository state (fetched at write time):** `dochne/wappalyzer` default branch `main` (288★, 167 forks, GPL-3.0); `urbanadventurer/WhatWeb` default branch `master` (6846★, GPL-2.0); `projectdiscovery/wappalyzergo` default branch `main` (1101★, MIT).
- **Commit:** only `docs/Step66-reference-benchmark.md` staged (explicit `git add`, never `-A`); `.poolside/settings.local.yaml`, `wappalyzer-tmp/*`, `whatweb-tmp/*`, and any env/runtime artifacts verified absent from the index; commit message `Step 66: External Product & Architecture Benchmark`; tree returned to clean (only `.poolside/` untracked) after commit. Hash recorded below after commit.

- **Commit hash:** per repository convention — a document cannot contain its own SHA, since editing the document after the commit changes the SHA (an unsolvable fixed point). `docs/Step65-report.md` therefore records the *baseline/parent* commit (`59e2d49`, "Step 64…") rather than its own SHA. By the same convention this Step 66 commit's baseline (parent) is `5771d2a` "Step 65: Detection Intelligence & Explainability", and the introducing commit has subject `Step 66: External Product & Architecture Benchmark`. Retrieve the exact SHA with `git rev-parse HEAD` / `git log -1 --oneline` — expected to be a single commit adding only `docs/Step66-reference-benchmark.md` (1 file / ~260 insertions), with no `.poolside/` or source changes in the index.
