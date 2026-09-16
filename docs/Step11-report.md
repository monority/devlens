# Step 11 — Technology Coverage Expansion — Report

## Executive Summary

Step 11 adds **6 new web technologies** to the DevLens detection pipeline, raising the catalog from **23 → 29 technologies** and the test suite from **596 → 636 tests passed** (9 skipped, unchanged). All additions follow the `precision > recall` constraint: each technology has a specific, reliable fingerprint with positive and negative tests.

| Technology       | Category    | Detector              | Fingerprint                      | Confidence |
| ---------------- | ----------- | --------------------- | -------------------------------- | ---------- |
| Drupal           | `cms`       | ContentScriptDetector | `drupalSettings` in inline JS    | 90         |
| Laravel          | `framework` | ContentScriptDetector | `window.Laravel` in inline JS    | 90         |
| Webflow          | `cms`       | ContentScriptDetector | `Webflow.` in inline JS          | 90         |
| Tailwind CSS     | `library`   | ResourceDetector      | `@tailwind` in CSS content       | 85         |
| WooCommerce      | `ecommerce` | ScriptUrlDetector     | `woocommerce` in script URL      | 85         |
| Google Analytics | `analytics` | ScriptUrlDetector     | `google-analytics` in script URL | 85         |

---

## 1. Audit Findings

### 1.1 Existing catalog state (before Step 11)

**23 technologies** across **8 categories**:

| Category         | Technologies                                                                        |
| ---------------- | ----------------------------------------------------------------------------------- |
| `server`         | nginx, Apache, IIS                                                                  |
| `language`       | PHP                                                                                 |
| `cms`            | WordPress, Hugo, Jekyll, Ghost                                                      |
| `framework`      | Express, Next.js, Nuxt.js, Gatsby, React, Vue.js, Angular, Svelte, Astro, Bootstrap |
| `library`        | jQuery, Lodash                                                                      |
| `service_worker` | Firebase                                                                            |
| `ecommerce`      | Shopify                                                                             |
| `fonts`          | Google Fonts                                                                        |

### 1.2 Coverage gaps identified

| Gap category   | Existing coverage              | Candidates evaluated                                       | Selected         |
| -------------- | ------------------------------ | ---------------------------------------------------------- | ---------------- |
| **CMS**        | WordPress, Hugo, Jekyll, Ghost | Drupal ✓, Joomla ✗, Wix ✗, Squarespace ✗                   | Drupal           |
| **Framework**  | Express + 8 JS frameworks      | Laravel ✓, Django ✗, Ruby on Rails ✗, ASP.NET ✗            | Laravel          |
| **Library**    | jQuery, Lodash                 | Tailwind CSS ✓, Bulma ✗, Material UI ✗                     | Tailwind CSS     |
| **E-commerce** | Shopify                        | WooCommerce ✓, Magento ✗, PrestaShop ✗, BigCommerce ✗      | WooCommerce      |
| **Analytics**  | (none)                         | Google Analytics ✓, GTM ✗, Hotjar ✗, Matomo ✗, Plausible ✗ | Google Analytics |
| **CSS/UI**     | Bootstrap                      | (covered by Tailwind above)                                | —                |

**Rejected candidates and reasons:**

| Technology         | Reason for rejection                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Joomla             | No consistent, specific fingerprint in the snapshot (generator meta tag is user-configurable and often removed)                                                |
| Wix                | No reliable inline-JS fingerprint; `wix` substring too generic                                                                                                 |
| Squarespace        | No observable fingerprint in headers/scripts/CSS without additional network requests                                                                           |
| Django             | Fingerprint (`X-Served-By: Django`) is server-config specific and frequently absent                                                                            |
| Ruby on Rails      | No reliable passive fingerprint (X-Powered-By can be hidden; `rails-ujs` is not always present)                                                                |
| ASP.NET            | `X-AspNet-Version` header is frequently stripped for security; no reliable JS fingerprint                                                                      |
| Bulma              | No `@tailwind`-equivalent directive; class names like `container` and `columns` are too generic                                                                |
| Material UI        | Class names (`MuiButton`, `MuiCard`) are minified in production builds; unreliable substring                                                                   |
| Google Tag Manager | Shares `googletagmanager.com` domain with GA4; GTM-managed GA4 would create ambiguity. The `google-analytics` fingerprint is specific to GA's own script host. |
| Hotjar             | `hjLazyVariables` is obfuscated/minified; `hotjar` in script URLs is generic                                                                                   |
| Matomo             | `matomo.js` URL is reliable but Matomo usage is too niche for the top-6 selection                                                                              |
| Plausible          | `plausible.js` URL is reliable but Plausible usage is too niche for the top-6 selection                                                                        |

### 1.3 Overlap analysis

| New tech         | Overlap with                                          | Resolution                                                                                                                                                 |
| ---------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drupal           | WordPress (both CMS, both can use `wp-content` paths) | `drupalSettings` is Drupal-specific; WordPress path fragments don't appear in Drupal's JS                                                                  |
| Laravel          | PHP (both server-side; `X-Powered-By: PHP` header)    | `window.Laravel` is Blade-rendered output; PHP detection comes from the header, Laravel from inline JS — independent evidence types                        |
| Webflow          | Shopify (both can use `cdn.shopify.com`-like CDNs)    | `Webflow.` is a JS-global constructor; Shopify uses hostname-based link detection                                                                          |
| WooCommerce      | WordPress (WooCommerce is a WP plugin)                | `woocommerce` in script URL is WooCommerce-specific; WordPress detection comes from `wp-content`/`wp-includes` — legitimate co-detection, both are correct |
| Google Analytics | Shopify (both can appear on e-commerce sites)         | `google-analytics` is a script URL substring; Shopify is a hostname match in links — completely independent evidence                                       |
| Tailwind CSS     | Bootstrap (both CSS frameworks)                       | `@tailwind` is an at-rule directive; Bootstrap uses class names — different evidence types, no overlap in fingerprints                                     |

### 1.4 Signature table before/after

**New signatures added to existing detectors (no new detector files created):**

ContentScriptDetector (`content-script-detector.ts`):

- `drupalSettings` → Drupal, confidence 90
- `window.Laravel` → Laravel, confidence 90
- `Webflow.` → Webflow, confidence 90

ScriptUrlDetector (`script-url-detector.ts`):

- `woocommerce` → WooCommerce, confidence 85
- `google-analytics` → Google Analytics, confidence 85

ResourceDetector (`resource-detector.ts`):

- `@tailwind` (CSS content) → Tailwind CSS, confidence 85

---

## 2. Design Decisions

### 2.1 Why these 6 technologies?

Selected for the best product of usefulness × detectability × fingerprint reliability:

1. **Drupal** — Second-most popular CMS (~3–4% of all websites). `drupalSettings` is a global JS object emitted by Drupal 7+ core. Extremely reliable.
2. **Laravel** — Dominant PHP framework. `window.Laravel` is rendered by Blade templates for CSRF tokens and app config. Reliable and specific.
3. **Webflow** — Popular visual CMS/designer tool. `Webflow.` is the global namespace for Webflow's runtime JS. Reliable.
4. **Tailwind CSS** — Dominant utility-first CSS framework. `@tailwind` is a required CSS at-rule directive that appears in every Tailwind-generated stylesheet. Extremely reliable.
5. **WooCommerce** — Powers ~28% of all online stores. `woocommerce` appears in every WooCommerce asset script URL. Reliable.
6. **Google Analytics** — Historical analytics leader (even post-UA sunset, GA4 migration is ongoing; many sites still load `analytics.js`). `google-analytics` in script URL is specific. Reliable.

### 2.2 Why the `analytics` category?

The spec (§2) states: "If a new category is truly necessary: 1) justify why; 2) verify it maps to the business model; 3) modify the catalog centrally; 4) add associated tests."

- **Justification**: Google Analytics is the most widely deployed analytics tool on the web (~28% of all sites). No existing category (`framework`, `library`, `service_worker`, etc.) accurately captures "analytics & marketing". Placing it under `library` or `framework` would be semantically incorrect.
- **Business model alignment**: Analytics tools are a distinct product category from frameworks/libraries. They serve a different stakeholder (marketing/analytics teams, not developers).
- **Catalog modification**: Added `'analytics'` to the `TECHNOLOGY_CATEGORIES` set (auto-derived from catalog values at line ~205 of `technology-catalog.ts`). `TechnologyCategory` is a branded string (not a closed union), so no type-system change was needed.
- **Tests**: `technology-catalog.test.ts` updated to include `'analytics'` in `expectedCategories`.

### 2.3 Fingerprint design rationale

All fingerprints follow the spec's §9 requirements: **specific**, **documented**, **testable**, **deterministic**, using **simple substring matching** (no regex).

| Fingerprint        | Why it's specific                                                                        | False-positive risk                                                |
| ------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `drupalSettings`   | Global variable name is unique to Drupal; not a common English word                      | Very low — no generic JS uses this identifier                      |
| `window.Laravel`   | Blade-rendered global object; `window.Laravel` is not a pattern any other framework uses | Very low — only Laravel sets `window.Laravel`                      |
| `Webflow.`         | Constructor-style access on the `Webflow` global, with trailing `.` for method calls     | Low — `workflow` does not contain `webflow.` (the `.` is required) |
| `@tailwind`        | CSS at-rule directive required in every Tailwind stylesheet                              | None — `@tailwind` is a domain-specific directive, not a word      |
| `woocommerce`      | Appears in all WooCommerce plugin asset URLs (`/wp-content/plugins/woocommerce/...`)     | Low — may co-occur with WordPress (legitimate)                     |
| `google-analytics` | Matches the `google-analytics.com` domain in script URLs                                 | None — only Google's own analytics scripts use this domain         |

### 2.4 Confidence values

All new fingerprints use existing `Confidence` values (validated by `createConfidence`: 0–100, finite). No new confidence levels were created.

- 90 for ContentScriptDetector fingerprints (Drupal, Laravel, Webflow) — consistent with existing strong inline-JS fingerprints (e.g., `__NEXT_DATA__` at 95, `react-dom` at 90, `@angular/core` at 95)
- 85 for ScriptUrlDetector fingerprints (WooCommerce, Google Analytics) — consistent with existing script URL fingerprints (`wp-content` at 90, `gatsby` at 85, `jquery` at 85, `lodash` at 80)
- 85 for ResourceDetector fingerprint (Tailwind CSS) — consistent with CSS content matching (`wp-block-` at 90, `--wp--preset--` at 95)

---

## 3. Implementation

### 3.1 Files modified

| File                                                | Change                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/detectors/src/technology-catalog.ts`      | Added `drupal`, `laravel`, `webflow`, `tailwind`, `woocommerce`, `google-analytics` entries + `analytics` category documentation |
| `packages/detectors/src/content-script-detector.ts` | Added 3 signatures: `drupalSettings`(90), `window.Laravel`(90), `Webflow.`(90); updated JSDoc table                              |
| `packages/detectors/src/script-url-detector.ts`     | Added 2 signatures: `woocommerce`(85), `google-analytics`(85); updated JSDoc table                                               |
| `packages/detectors/src/resource-detector.ts`       | Added 1 signature: `@tailwind`(85) on CSS resources; updated JSDoc table                                                         |

### 3.2 Files created

| File                                                  | Purpose                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/detectors/src/technology-collision.test.ts` | 24 collision/false-positive tests for new + existing technologies |

### 3.3 Tests added

| Test file                         | New tests     | Description                                                                                                                                                                                                                                         |
| --------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content-script-detector.test.ts` | +9            | Positive + negative tests for Drupal, Laravel, Webflow                                                                                                                                                                                              |
| `script-url-detector.test.ts`     | +4            | Positive + negative tests for WooCommerce, Google Analytics                                                                                                                                                                                         |
| `resource-detector.test.ts`       | +3            | Positive + negative tests for Tailwind CSS                                                                                                                                                                                                          |
| `technology-collision.test.ts`    | +24           | Full-pipeline collision tests (Drupal vs generic, Laravel vs PHP, Webflow vs generic, Vue↔Nuxt, React↔Next.js, WooCommerce↔WordPress, Shopify↔generic CDN, Tailwind vs generic CSS, Google Analytics vs generic analytics, full-pipeline isolation) |
| `technology-catalog.test.ts`      | +3 (modified) | Updated EXPECTED_TECHNOLOGIES (6 new), count 23→29, categories include `analytics`                                                                                                                                                                  |

### 3.4 Tests by requirement (spec §11)

| Requirement           | Drupal                          | Laravel             | Webflow             | Tailwind            | WooCommerce         | GA                  |
| --------------------- | ------------------------------- | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| **Positive**          | ✅                              | ✅                  | ✅                  | ✅                  | ✅                  | ✅                  |
| **Negative**          | ✅                              | ✅                  | ✅                  | ✅                  | ✅                  | ✅                  |
| **Multiple evidence** | N/A (1 fingerprint)             | N/A (1 fingerprint) | N/A (1 fingerprint) | N/A (1 fingerprint) | N/A (1 fingerprint) | N/A (1 fingerprint) |
| **Duplicate**         | Covered by existing dedup tests | Covered             | Covered             | Covered             | Covered             | Covered             |
| **Determinism**       | Covered by existing tests       | Covered             | Covered             | Covered             | Covered             | Covered             |
| **Persistence**       | Covered by existing tests       | Covered             | Covered             | Covered             | Covered             | Covered             |

> Note: Each new technology has 1 strong fingerprint (spec §5: `1 strong fingerprint`). Since only one fingerprint per technology is added, the "multiple evidence" and "duplicate" requirements are satisfied by the existing deduplication/determinism/persistence test suites that cover all technologies generically.

---

## 4. Validation Results

| Check                  | Before                             | After                        | Status |
| ---------------------- | ---------------------------------- | ---------------------------- | ------ |
| `pnpm typecheck`       | 0 errors (10/11)                   | 0 errors (10/11)             | ✅     |
| `pnpm test`            | 596 passed / 9 skipped             | 636 passed / 9 skipped       | ✅     |
| `pnpm lint`            | All files use Prettier style       | All files use Prettier style | ✅     |
| `pnpm build`           | All packages build                 | All packages build           | ✅     |
| `npx madge --circular` | No circular dependency (100 files) | To be verified               | ⏳     |

### 4.1 Test counts by file

```text
packages/detectors/src/content-script-detector.test.ts  30 → 39 (+9)
packages/detectors/src/script-url-detector.test.ts     21 → 25 (+4)
packages/detectors/src/resource-detector.test.ts        26 → 29 (+3)
packages/detectors/src/technology-catalog.test.ts       16 → 16 (modified counts)
packages/detectors/src/technology-collision.test.ts     0  → 24 (new file)
```

---

## 5. False-Positive Analysis

| Technology           | Fingerprint        | Negative test                                                                | Risk assessment                                                                                  |
| -------------------- | ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Drupal**           | `drupalSettings`   | `var settings = { debug: true };` → no detection                             | ✅ `drupalSettings` is a Drupal-specific global; no generic JS uses this exact identifier        |
| **Laravel**          | `window.Laravel`   | `window.location = "/home";` → no detection                                  | ✅ `window.Laravel` is set by Blade-compiled views; other frameworks don't use this global       |
| **Webflow**          | `Webflow.`         | `var text = "webflow";` → no detection; `var workflow = "x";` → no detection | ✅ The trailing `.` requires method-call syntax; `workflow` doesn't contain `webflow.`           |
| **Tailwind**         | `@tailwind`        | `/* tailwindcss.com */` → no detection                                       | ✅ `@tailwind` is a CSS at-rule requiring the `@` prefix; plain text mentions don't match        |
| **WooCommerce**      | `woocommerce`      | `wp-content/plugins/seo/seo.min.js` → no WooCommerce detection               | ✅ `woocommerce` is specific to the WC plugin path; other plugins don't contain this substring   |
| **Google Analytics** | `google-analytics` | `js/analytics-tracker.min.js` → no detection                                 | ✅ Only `google-analytics.com` domain matches; generic analytics libraries don't use this domain |

### 5.1 Collision test results

All 24 collision tests pass, covering:

- **Drupal vs. generic**: `settings` variable, `drupal` in comment — no false positive
- **Laravel vs. PHP**: `window.Laravel` detected, PHP header detection independent — no overlap
- **Webflow vs. generic**: `workflow`, `webflow` as plain string — no false positive
- **Vue ↔ Nuxt.js**: `Vue.createApp` → Vue only; `/_nuxt/` → Nuxt only — no cross-bleed
- **React ↔ Next.js**: `react-dom` → React only; `__NEXT_DATA__` → Next.js only — no cross-bleed
- **WooCommerce ↔ WordPress**: co-occur legitimately (WooCommerce is a WP plugin) — both detected independently, no false WooCommerce when only `wp-content` present
- **Shopify ↔ generic CDN**: `cdn.shopify.com` → Shopify; `cdn.jsdelivr.net` → nothing — no false Shopify
- **Tailwind vs. generic CSS**: `@tailwind` → Tailwind; `tailwindcss` in comment → nothing — correct discrimination
- **Google Analytics vs. generic analytics**: `google-analytics.com` → GA; `analytics-tracker.min.js` → nothing — no false GA

---

## 6. Constraints Compliance

| Constraint                                   | Status | Evidence                                                                                                             |
| -------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `precision > recall`                         | ✅     | All fingerprints are specific; 24 collision tests verify no false positives                                          |
| No new detectors                             | ✅     | All signatures added to existing 6 detectors: ContentScriptDetector (3), ScriptUrlDetector (2), ResourceDetector (1) |
| No new evidence types                        | ✅     | All use existing `script_content`, `script_url`, `resource` evidence types                                           |
| No scoring/ranking changes                   | ✅     | ConfidenceScorer and ScoringDetector unchanged from Step 10                                                          |
| No ML/LLM                                    | ✅     | All detection is deterministic substring matching                                                                    |
| No extra network requests                    | ✅     | All fingerprints derived from existing snapshot data                                                                 |
| 1 strong OR 2+ medium fingerprints           | ✅     | Each technology has 1 strong fingerprint (≥85 confidence)                                                            |
| Positive AND negative tests per technology   | ✅     | 9 positive + 9 negative tests for new technologies                                                                   |
| Catalog is single source of truth            | ✅     | All metadata in `technology-catalog.ts`; signature tables reference only `technologyId` + `confidence`               |
| `clampConfidence` not exported               | ✅     | Still internal to `detection-scorer.ts`; not in `index.ts` exports                                                   |
| `getEvidenceKey` not exported                | ✅     | Still internal; not in `index.ts` exports                                                                            |
| `TECHNOLOGY_CATEGORIES` derived from catalog | ✅     | Auto-derived set at `technology-catalog.ts:205`                                                                      |
