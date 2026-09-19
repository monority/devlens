# Step 64 Report — Real-World Detection Audit

**Step:** 64 — _Real-World Detection Audit_
**Predecessor:** Step 63 (`c932050`) — data-integrity bugs fixed & pipeline hardened.
**Commit:** _to be created: `Step 64: Real-World Detection Audit`_

> Does DevLens actually detect technologies correctly when confronted with
> realistic web pages and realistic HTML observations?

This is **not** a UI feature and **not** a generic architecture audit. It is a
focused end-to-end exercise of the real detection pipeline against
representative inputs, judged against five criteria:

- correct
- complete enough
- deterministic
- free of obvious false positives
- free of obvious false negatives **caused by detector bugs**

---

## 0. Recon

The pipeline is assembled by a single factory and is therefore identical for
both entry points (`apps/web` API + `apps/worker`):

```
createProductionDetector()          // packages/detectors/src/production-detector.ts
  = ScoringDetector(
      new ConfidenceScorer(),
      new DeduplicatingDetector(
        new CompositeDetector([
          new HeaderDetector(),
          new MetaTagDetector(),
          new ScriptUrlDetector(),
          new ContentScriptDetector(),
          new ResourceDetector(),
          new LinkDetector(),
        ]),
      ),
    )
```

- **Catalog:** 24 technologies across 10 categories
  (`packages/detectors/src/technology-catalog.ts`):
  `server` (nginx, apache, iis), `language` (php), `framework` (express,
  laravel, nextjs, nuxtjs, gatsby, react, vue, angular, svelte, astro,
  bootstrap), `library` (jquery, lodash, tailwind), `cms` (wordpress, drupal,
  webflow, hugo, jekyll, ghost, prestashop), `ecommerce` (shopify,
  woocommerce), `service_worker` (firebase), `cdn` (cloudflare), `fonts`
  (google-fonts), `analytics` (google-analytics, plausible).

- **Existing audit coverage:** Phase 2 was already largely implemented by the
  Step 13 golden suite — `fixtures/detector-fixtures.ts` (1363 lines,
  positive/negative/coexistence/adversarial fixtures) exercised through the
  real pipeline by `golden-fixtures.test.ts` (expected/forbidden + 3-run
  determinism + catalog-coverage + precision summary), plus
  `pipeline.integration.test.ts` (Scenario A–F with exact-score assertions).
  Baseline before this step: **1758 tests, 0 failures.**

---

## 1. Detection matrix (Phase 1)

Mapping from a catalog technology to the signature(s) that can produce it.
Multiple rows per technology = it is detectable from multiple independent
modalities (which yields a scoring diversity bonus).

| Technology       | Category       | Detector              | Signal                                                                                              | Evidence type  | Confidence |
| ---------------- | -------------- | --------------------- | --------------------------------------------------------------------------------------------------- | -------------- | ---------- |
| nginx            | server         | HeaderDetector        | `Server` contains `nginx`                                                                           | http_header    | 95         |
| apache           | server         | HeaderDetector        | `Server` contains `apache`                                                                          | http_header    | 95         |
| iis              | server         | HeaderDetector        | `Server` contains `microsoft-iis`                                                                   | http_header    | 95         |
| cloudflare       | cdn            | HeaderDetector        | `Server` contains `cloudflare`                                                                      | http_header    | 95         |
| php              | language       | HeaderDetector        | `X-Powered-By` contains `php`                                                                       | http_header    | 90         |
| express          | framework      | HeaderDetector        | `X-Powered-By` contains `express`                                                                   | http_header    | 90         |
| wordpress        | cms            | MetaTagDetector       | `<meta name=generator>` contains `wordpress`                                                        | meta_tag       | 90         |
|                  |                | ScriptUrlDetector     | script `src` contains `wp-content` / `wp-includes`                                                  | script_url     | 90         |
|                  |                | ResourceDetector      | `robots` contains `wp-admin`/`wp-includes`(90); css contains `--wp--preset--`(95) / `wp-block-`(90) | resource       | 95         |
|                  |                | LinkDetector          | link href path-segment `wp-content`,`wp-includes`,`wp-json`                                         | link           | 90         |
| drupal           | cms            | MetaTagDetector       | generator contains `drupal`                                                                         | meta_tag       | 90         |
|                  |                | ContentScriptDetector | inline contains `drupalSettings`                                                                    | script_content | 90         |
| hugo             | cms            | MetaTagDetector       | generator contains `hugo`                                                                           | meta_tag       | 85         |
| jekyll           | cms            | MetaTagDetector       | generator contains `jekyll`                                                                         | meta_tag       | 85         |
| ghost            | cms            | MetaTagDetector       | generator contains `ghost`                                                                          | meta_tag       | 85         |
| prestashop       | cms            | MetaTagDetector       | generator contains `prestashop`                                                                     | meta_tag       | 90         |
| webflow          | cms            | ContentScriptDetector | inline contains `Webflow.`                                                                          | script_content | 90         |
| nextjs           | framework      | MetaTagDetector       | generator contains `next.js`                                                                        | meta_tag       | 85         |
|                  |                | ScriptUrlDetector     | script `src` contains `/_next/`                                                                     | script_url     | 90         |
|                  |                | ContentScriptDetector | inline contains `__NEXT_DATA__`(95) / `next/router` / `next/navigation`(90)                         | script_content | 95         |
| nuxtjs           | framework      | MetaTagDetector       | generator contains `nuxt.js`                                                                        | meta_tag       | 85         |
|                  |                | ScriptUrlDetector     | script `src` contains `/_nuxt/`                                                                     | script_url     | 90         |
| gatsby           | framework      | MetaTagDetector       | generator contains `gatsby`                                                                         | meta_tag       | 85         |
|                  |                | ScriptUrlDetector     | script `src` contains `gatsby`                                                                      | script_url     | 85         |
| react            | framework      | ContentScriptDetector | inline contains `react-dom` / `ReactDOM`                                                            | script_content | 90         |
| vue              | framework      | ContentScriptDetector | inline contains `Vue.createApp`                                                                     | script_content | 95         |
| angular          | framework      | ContentScriptDetector | inline contains `@angular/core`(95) / `platformBrowserDynamic`(90)                                  | script_content | 95         |
| svelte           | framework      | ContentScriptDetector | inline contains `__SVELTE__`(95) / `SvelteComponent`(90)                                            | script_content | 95         |
| astro            | framework      | ContentScriptDetector | inline contains `astro-island`                                                                      | script_content | 95         |
| laravel          | framework      | ContentScriptDetector | inline contains `window.Laravel`                                                                    | script_content | 90         |
| bootstrap        | framework      | ScriptUrlDetector     | script `src` contains `bootstrap.`                                                                  | script_url     | 80         |
| jquery           | library        | ScriptUrlDetector     | script `src` contains `jquery`                                                                      | script_url     | 85         |
| lodash           | library        | ScriptUrlDetector     | script `src` contains `lodash`                                                                      | script_url     | 80         |
| tailwind         | library        | ResourceDetector      | css contains `@tailwind`                                                                            | resource       | 85         |
| shopify          | ecommerce      | LinkDetector          | link `href` hostname == `cdn.shopify.com` / `shopifycdn.com`                                        | link           | 95         |
| woocommerce      | ecommerce      | ScriptUrlDetector     | script `src` contains `woocommerce`                                                                 | script_url     | 85         |
| google-fonts     | fonts          | LinkDetector          | link `href` hostname == `fonts.googleapis.com`                                                      | link           | 90         |
| google-analytics | analytics      | ScriptUrlDetector     | script `src` contains `google-analytics`                                                            | script_url     | 85         |
| plausible        | analytics      | ScriptUrlDetector     | script `src` contains `plausible.io`                                                                | script_url     | 90         |
| firebase         | service_worker | ResourceDetector      | manifest content contains `gcm_sender_id`                                                           | resource       | 95         |

Coverage note: every catalog technology has ≥1 positive fixture in the suite
(see catalog-coverage test in `golden-fixtures.test.ts`), so there are **no
un-covered technologies**. Categories absent from the catalog by design: hosting
providers (Vercel/Netlify/etc.) and backend languages beyond PHP — not
in-scope per "do not invent technologies."

---

## 2. Audit methodology (Phases 2–3)

Added `packages/detectors/src/realworld-audit.test.ts`, which builds the **real**
`createProductionDetector()` and runs four realistic fixtures, asserting the
**explainable** output (ranked order, exact final confidence, evidence types) —
not just presence/absence:

- **R1 — "WordPress blog behind Cloudflare (PHP backend + jQuery)"**:
  `Server: cloudflare`, `X-Powered-By: PHP/8.2`, meta `WordPress 6.4.2`,
  wp-content + wp-includes/jquery scripts, a wp-content stylesheet link, and
  `robots.txt` + block-editor CSS resources. WordPress is observed across **four
  independent modalities** (meta_tag, script_url, resource, link) → score must
  hit 100 via the diversity bonus.
  - **Expected (asserted & passing):** `[wordpress 100, cloudflare 95, php 90,
jquery 85]`, WP evidence = 5 items / 4 distinct types, deterministic across
    3 runs.
  - Recompute: WP base 95 (ResourceDetector `--wp--preset--`), n=4 → bonus 10 →
    105 → capped 100. ✅ matches scorer formula.

- **R2 — "Shopify storefront on Cloudflare + Google Fonts + direct GA"**:
  `Server: cloudflare`, `cdn.shopify.com` link, `fonts.googleapis.com` link,
  `google-analytics.com/analytics.js` script.
  - **Expected (asserted & passing):** `[cloudflare 95, shopify 95,
google-fonts 90, google-analytics 85]`. The cloudflare/shopify tie (95/95)
    is broken by `technology.id` ASC → `cloudflare` before `shopify`. ✅
    confirms the ranking contract.

- **G1 — "Known limitation: Angular production build (externalized bundles)"**:
  external `runtime.js`/`polyfills-es2022.js`/`main-es2022.js` + a minified
  webpack runtime inline (no `@angular/core` / `platformBrowserDynamic`
  literal).
  - **Asserts (passing):** `angular` is **not** detected (0 detections).
    Locks the documented gap (see Findings §3.1).

- **G2 — "Known limitation: GA4 via Google Tag Manager only"**:
  script `googletagmanager.com/gtag/js?id=G-…`.
  - **Asserts (passing):** `google-analytics` is **not** detected (0 detections).
    Locks the documented gap (see Findings §3.2).

**Full-suite result after adding the file: `Test Files 100 passed | 2 skipped
(102)`, `Tests 1765 passed | 18 skipped (1783)`, 0 failures.** The 2 skipped
files are the pre-existing no-DB / no-network suites.

---

## 3. Findings

### 3.1 Confirmed correct — no functional detection defect

| Aspect                 | Verdict                                 | Evidence                                                           |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Pipeline wiring        | ✅ single source of truth               | `createProductionDetector()`; no web/worker divergence             |
| Signature matching     | ✅ as documented                        | all 6 detectors behave per their JSDoc tables                      |
| Scoring formula        | ✅ correct & explicable                 | R1/R2 exact scores match `min(100, round(base + min(10,(n−1)·5)))` |
| Deduplication          | ✅ one-per-tech, merged/evidence-sorted | R1 WP = 5 items / 4 types from 4 modalities                        |
| Ranking                | ✅ deterministic tie-break              | R2 cloudflare before shopify at 95/95 by id-asc                    |
| Evidence identity      | ✅ fixed in Step 63                     | distinct `Server` values no longer collapse                        |
| Persistence round-trip | ✅ fixed in Step 63                     | `html.links` survives DB write/read                                |
| False positives        | ✅ none in negatives                    | existing `noise` / `false-positive-*` / `adv-*` + R2 positive      |
| Determinism            | ✅ reproducible                         | 3-run identity checks in golden suite + R1                         |

**No production/detector defect was found or required.** The previous real
defects (evidence-identity divergence, `html.links` persistence loss) were
fixed in Step 63 and are locked by tests.

### 3.2 Documented real-world limitations (NOT bugs — missing signatures / conservative design)

These are **coverage gaps**, not detector logic bugs, and per the Step 63
"do not redesign detectors" precedent they are **documented, not "fixed"**:

1. **Production-framework bundles are not detected.** Framework signatures live
   on inline bootstrap markers (`Vue.createApp`, `__SVELTE__`, `astro-island`,
   `@angular/core`, `react-dom`/`ReactDOM`). When a production build externalizes
   bundles to `<script src>` and minifies inline content, the markers are gone
   and — for Angular/Vue/Svelte/Astro — there is **no URL signature**, so the
   technology is missed. `R1/G1` demonstrates this for Angular
   (`platformBrowserDynamic` / `@angular/core` stripped from the minified
   `main-es2022.js`). Next.js is the exception: it has the `/_next/` URL
   signature, so it is detected even without inline bootstrap.
   - _Why not fix:_ adding URL signatures for Angular/Vue/Svelte bundles risks
     false positives (those substrings are not framework-unique) and would be a
     detector redesign out of scope here.

2. **GA4 via Google Tag Manager is not detected.** The `google-analytics`
   signature matches the `google-analytics` substring in a script `src`. GA4 loaded
   through GTM uses `googletagmanager.com/gtag/js?id=G-…`, which lacks that
   substring → not detected (`G2`).
   - _Why not fix:_ matching `googletagmanager.com` would false-positive on
     GTM-only properties (GTM is a tag manager, not GA). Distinguishing GA-via-GTM
     from GTM-only requires inspecting the injected `dataLayer`/config, which is
     out of scope for the current signature model.

3. **`ScriptUrlDetector` substring-URL precision asymmetry.** This detector
   matches script `src` URLs with bare `String.includes()` (e.g. `wp-content`,
   `woocommerce`, `lodash`, `jquery`). `LinkDetector`, by contrast, was upgraded
   (Step 20) to structured hostname / path-segment matching and is guarded by
   `false-positive-shopify-subdomain`, `false-positive-next-substring`,
   `adv-path-segment-trailing-slash`, etc. The URL detector has **no equivalent
   guards**, so a script URL containing e.g. `wp-content-polyfill.js` or a
   `lodash`-bearing wrapper could false-positive. Latent (no current fixture
   triggers it); flagged for a future precision pass.

4. **Unused evidence types.** `javascript_global` and `html` are defined in
   `@devlens/core` `Evidence` and canonicalized by `getEvidenceKey`, but **no
   detector emits them.** Reserved/unimplemented — not a bug.

5. **No hosting/provider signatures.** `Server: vercel` (and Netlify/CloudFront
   headers) are not mapped to any catalog technology (only `cloudflare` exists as
   a CDN). Such origins surface only via the _application_ signal they front
   (e.g. Next.js), never as infrastructure. Documented.

### 3.3 Verdict

| Criterion                                   | Outcome                                                 |
| ------------------------------------------- | ------------------------------------------------------- |
| Correct                                     | ✅                                                      |
| Complete enough (for the supported catalog) | ✅ every tech has ≥1 positive fixture                   |
| Deterministic                               | ✅ (fixed order, key-sorted evidence, id-asc tie-break) |
| Free of obvious false positives             | ✅ (negatives + adversarial fixtures pass)              |
| Free of FNs caused by **detector bugs**     | ✅ (remaining FNs are missing signatures, §3.2)         |
| Correctly explained by evidence             | ✅ (R1/R2 assert evidence types + exact scores)         |

The data path is sound; the residual detection gaps are signature **coverage**,
not logic defects, and are deliberately left for a future signature-expansion
step (out of scope for "do not redesign detectors").

---

## 4. Changes in this step

| File                                             | Change                                                                                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/detectors/src/realworld-audit.test.ts` | **New.** Real-pipeline audit: 2 realistic multi-tech fixtures (exact scores/evidence/ranking + determinism) and 2 "known limitation" negatives (Angular external bundle, GA4-via-GTM). |
| `docs/Step64-report.md`                          | **New.** This report.                                                                                                                                                                  |

No production code was modified (the pipeline was already correct); this step is
additive audit coverage + documentation, consistent with the Step 63 "fix
genuine defects only" principle — here the genuine defects were already fixed,
so only audit artifacts remain.

---

## 5. Validation gates

| Gate                               | Result                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vitest run` (full monorepo)       | ✅ 1765 passed, 0 failed (2 DB/network suites skipped)                                                                                                 |
| `realworld-audit.test.ts`          | ✅ 7/7 (2 positives, determinism, 2 gap-negatives)                                                                                                     |
| `pnpm typecheck`                   | ✅ all 11 workspace projects                                                                                                                           |
| `eslint .`                         | ✅ clean                                                                                                                                               |
| `prettier --check` (changed files) | ✅ clean                                                                                                                                               |
| `pnpm build` (`pnpm -r build`)     | ✅ Next compiled, 0 errors                                                                                                                             |
| `madge` circular deps              | ✓ not a project dependency; manual review — new test file adds no source edges (test-only, imports `@devlens/core` types + `createProductionDetector`) |
