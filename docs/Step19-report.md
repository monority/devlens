# Step 19 — Technology Detection Coverage & Catalog Expansion

## 1. Coverage Audit

### 1.1 Current catalog inventory (29 technologies)

| #   | Technology       | Category         | Detector                                                              | Primary fingerprint                                                             |
| --- | ---------------- | ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | nginx            | `server`         | HeaderDetector                                                        | `Server: nginx`                                                                 |
| 2   | Apache           | `server`         | HeaderDetector                                                        | `Server: apache`                                                                |
| 3   | IIS              | `server`         | HeaderDetector                                                        | `Server: microsoft-iis`                                                         |
| 4   | PHP              | `language`       | HeaderDetector                                                        | `X-Powered-By: php`                                                             |
| 5   | WordPress        | `cms`            | MetaTagDetector + ScriptUrlDetector + ResourceDetector + LinkDetector | `generator: WordPress`, `wp-content`, `@tailwind` CSS, `wp-admin` in robots.txt |
| 6   | Drupal           | `cms`            | ContentScriptDetector                                                 | `drupalSettings` in inline JS                                                   |
| 7   | Webflow          | `cms`            | ContentScriptDetector                                                 | `Webflow.` in inline JS                                                         |
| 8   | Hugo             | `cms`            | MetaTagDetector                                                       | `generator: Hugo`                                                               |
| 9   | Jekyll           | `cms`            | MetaTagDetector                                                       | `generator: Jekyll`                                                             |
| 10  | Ghost            | `cms`            | MetaTagDetector                                                       | `generator: Ghost`                                                              |
| 11  | Express          | `framework`      | HeaderDetector                                                        | `X-Powered-By: Express`                                                         |
| 12  | Laravel          | `framework`      | ContentScriptDetector                                                 | `window.Laravel` in inline JS                                                   |
| 13  | Next.js          | `framework`      | MetaTagDetector + ScriptUrlDetector + ContentScriptDetector           | `generator: Next.js`, `/_next/`, `__NEXT_DATA__`                                |
| 14  | Nuxt.js          | `framework`      | MetaTagDetector + ScriptUrlDetector                                   | `generator: Nuxt.js`, `/_nuxt/`                                                 |
| 15  | Gatsby           | `framework`      | MetaTagDetector + ScriptUrlDetector                                   | `generator: Gatsby`, `gatsby` in script URL                                     |
| 16  | React            | `framework`      | ContentScriptDetector                                                 | `react-dom` / `ReactDOM` / `createRoot(`                                        |
| 17  | Vue.js           | `framework`      | ContentScriptDetector                                                 | `Vue.createApp`                                                                 |
| 18  | Angular          | `framework`      | ContentScriptDetector                                                 | `@angular/core` / `platformBrowserDynamic`                                      |
| 19  | Svelte           | `framework`      | ContentScriptDetector                                                 | `__SVELTE__` / `SvelteComponent`                                                |
| 20  | Astro            | `framework`      | ContentScriptDetector                                                 | `astro-island`                                                                  |
| 21  | Bootstrap        | `framework`      | ScriptUrlDetector                                                     | `bootstrap` in script URL                                                       |
| 22  | jQuery           | `library`        | ScriptUrlDetector                                                     | `jquery` in script URL                                                          |
| 23  | Lodash           | `library`        | ScriptUrlDetector                                                     | `lodash` in script URL                                                          |
| 24  | Tailwind CSS     | `library`        | ResourceDetector                                                      | `@tailwind` in CSS                                                              |
| 25  | Firebase         | `service_worker` | ResourceDetector                                                      | `gcm_sender_id` in manifest                                                     |
| 26  | Shopify          | `ecommerce`      | LinkDetector                                                          | `cdn.shopify.com` / `shopifycdn.com`                                            |
| 27  | WooCommerce      | `ecommerce`      | ScriptUrlDetector                                                     | `woocommerce` in script URL                                                     |
| 28  | Google Fonts     | `fonts`          | LinkDetector                                                          | `fonts.googleapis.com` hostname                                                 |
| 29  | Google Analytics | `analytics`      | ScriptUrlDetector                                                     | `google-analytics` in script URL                                                |

### 1.2 Category coverage gaps

| Category         | Current count | Candidate additions | Rationale                                                         |
| ---------------- | ------------- | ------------------- | ----------------------------------------------------------------- |
| `server`         | 3             | —                   | Well covered                                                      |
| `language`       | 1             | —                   | Out of scope (requires code analysis beyond snapshot)             |
| `cms`            | 6             | PrestaShop          | E-commerce CMS — strong meta generator signal                     |
| `framework`      | 11            | —                   | Well covered                                                      |
| `library`        | 3             | —                   | Well covered                                                      |
| `service_worker` | 1             | —                   | Very niche                                                        |
| `ecommerce`      | 2             | —                   | Covered via WordPress+WooCommerce stack                           |
| `fonts`          | 1             | —                   | Google Fonts dominates                                            |
| `analytics`      | 1             | Plausible           | Privacy-focused analytics — strong script URL signal              |
| **`cdn`** (new)  | 0             | Cloudflare          | Dominant reverse proxy/CDN (~25% of web) — strong `Server` header |

### 1.3 Detector coverage summary

| Detector              | Signatures    | Technologies covered                                                                                         | Evidence type    |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ | ---------------- |
| HeaderDetector        | 6 (5+1 new)   | nginx, Apache, IIS, PHP, Express, **Cloudflare**                                                             | `http_header`    |
| MetaTagDetector       | 8 (7+1 new)   | WordPress, Hugo, Jekyll, Ghost, Next.js, Gatsby, Nuxt.js, **PrestaShop**                                     | `meta_tag`       |
| ScriptUrlDetector     | 11 (10+1 new) | WordPress, Next.js, Nuxt.js, Gatsby, jQuery, Bootstrap, Lodash, WooCommerce, Google Analytics, **Plausible** | `script_url`     |
| ContentScriptDetector | 15            | Next.js, React, Vue, Angular, Svelte, Astro, Drupal, Laravel, Webflow                                        | `content_script` |
| ResourceDetector      | 7             | WordPress, Tailwind CSS, Firebase                                                                            | `resource`       |
| LinkDetector          | 8             | WordPress, Shopify, Google Fonts                                                                             | `link`           |

### 1.4 Fixture coverage summary (before Step 19 changes)

- 29 positive fixtures (one per technology)
- 2 coexistence fixtures (Next.js+React, WordPress+WooCommerce)
- 4 negative/false-positive fixtures
- All 29 technology IDs appear in at least one fixture's `expected` or `forbidden` list

---

## 2. Candidate Selection

### 2.1 Candidates evaluated

| Candidate   | Category    | Observable signal                   | Detector fit      | Verdict                                                                              |
| ----------- | ----------- | ----------------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| Cloudflare  | `cdn`       | `Server: cloudflare` header         | HeaderDetector    | ✅ **Approved**                                                                      |
| Vercel      | `cdn`       | `Server: vercel` header             | HeaderDetector    | ⚠️ Rejected — already implicitly detected via Next.js on Vercel; low marginal signal |
| PrestaShop  | `cms`       | `generator` meta: `PrestaShop`      | MetaTagDetector   | ✅ **Approved**                                                                      |
| Matomo      | `analytics` | `matomo.js` / `piwik.js` script URL | ScriptUrlDetector | ⚠️ Rejected — legacy piwik.js name makes signal less reliable                        |
| Plausible   | `analytics` | `plausible.io` script URL           | ScriptUrlDetector | ✅ **Approved**                                                                      |
| BigCommerce | `ecommerce` | `cdn.bcapp.com` script URL          | ScriptUrlDetector | ⚠️ Rejected — CDN URL less widely known; false-positive risk on generic subdomains   |
| Joomla      | `cms`       | `generator` meta: `Joomla!`         | MetaTagDetector   | ⚠️ Rejected — Joomla's meta generator format varies; lower confidence                |

### 2.2 Selection rationale

**Precision over recall.** Only candidates with:

1. A strong, specific observable signal in the existing snapshot model
2. Low false-positive risk (specific substring/domain, not generic keyword)
3. A natural fit in an existing detector (no new detector needed)
4. A well-established, widely-deployed technology

were approved for addition. Vercel was rejected because the `nextjs` fixture already captures the Vercel server header, and the marginal signal is low. Matomo was rejected because the historical `piwik.js` script URL creates ambiguity.

---

## 3. Signature Design

### 3.1 Cloudflare (HeaderDetector)

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| Header        | `Server`                                 |
| Match         | case-insensitive substring: `cloudflare` |
| Technology ID | `cloudflare`                             |
| Confidence    | 95                                       |
| Evidence type | `http_header`                            |

**False-positive analysis:**

- The `Server: cloudflare` header is set exclusively by Cloudflare's edge infrastructure. No legitimate non-Cloudflare site sets this value.
- The signature matches only the `Server` header (not `X-Powered-By` or other headers), preventing false positives from headers like `X-Powered-By: cloudflare-protection`.
- Risk: extremely low.

### 3.2 PrestaShop (MetaTagDetector)

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| Meta tag      | `generator`                              |
| Match         | case-insensitive substring: `prestashop` |
| Technology ID | `prestashop`                             |
| Confidence    | 90                                       |
| Evidence type | `meta_tag`                               |

**False-positive analysis:**

- The `<meta name="generator" content="PrestaShop 1.7.x">` tag is set by PrestaShop itself. Only PrestaShop sites emit this generator string.
- Consistent with existing CMS detection (WordPress, Ghost, Hugo, etc. all use meta generator).
- Risk: low — meta generator tags are CMS-controlled and rarely spoofed.

### 3.3 Plausible (ScriptUrlDetector)

| Field         | Value                                      |
| ------------- | ------------------------------------------ |
| Script src    | case-insensitive substring: `plausible.io` |
| Technology ID | `plausible`                                |
| Confidence    | 90                                         |
| Evidence type | `script_url`                               |

**False-positive analysis:**

- The `plausible.io` domain is exclusively used by Plausible Analytics for script delivery (`https://plausible.io/js/script.js`).
- A script URL containing `plausible` as a substring but NOT `plausible.io` (e.g. `/js/plausible-analytics.js`) would NOT match — this is covered by the false-positive fixture.
- Consistent with existing analytics detection (Google Analytics uses `google-analytics` in script URL).
- Risk: very low.

---

## 4. Catalog Changes

### 4.1 New catalog entries

| ID           | Name                | Category    |
| ------------ | ------------------- | ----------- |
| `cloudflare` | Cloudflare          | `cdn`       |
| `prestashop` | PrestaShop          | `cms`       |
| `plausible`  | Plausible Analytics | `analytics` |

### 4.2 Files modified

| File                                                   | Change                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `packages/detectors/src/technology-catalog.ts`         | Added 3 entries to `TECHNOLOGY_CATALOG`; updated doc comment for `cdn` category                      |
| `packages/detectors/src/header-detector.ts`            | Added Cloudflare signature to `SIGNATURES`; updated doc comment table                                |
| `packages/detectors/src/meta-tag-detector.ts`          | Added PrestaShop signature to `SIGNATURES`; updated doc comment table                                |
| `packages/detectors/src/script-url-detector.ts`        | Added Plausible signature to `SIGNATURES`; updated doc comment table                                 |
| `packages/detectors/src/fixtures/detector-fixtures.ts` | Added 3 entries to `ALL_TECH_IDS`; added 3 positive fixtures + 2 false-positive fixtures             |
| `docs/architecture/detectors.md`                       | Updated catalog table, category table, detector signature tables, and "New technologies added" table |

### 4.3 Catalog count

- Before: 29 technologies
- After: **32 technologies**
- New category introduced: `cdn` (Cloudflare)

---

## 5. Detector Signatures Added

### 5.1 HeaderDetector — Cloudflare

```typescript
{
  headerName: 'server',
  matchValue: 'cloudflare',
  technologyId: 'cloudflare',
  confidence: 95,
}
```

### 5.2 MetaTagDetector — PrestaShop

```typescript
{
  tagName: 'generator',
  matchContent: 'prestashop',
  technologyId: 'prestashop',
  confidence: 90,
}
```

### 5.3 ScriptUrlDetector — Plausible

```typescript
{
  matchUrl: 'plausible.io',
  technologyId: 'plausible',
  confidence: 90,
}
```

---

## 6. Positive Fixtures

### 6.1 Cloudflare fixture

```typescript
{
  name: 'cloudflare',
  description: 'Site behind Cloudflare reverse proxy (Server: cloudflare header)',
  category: 'cdn',
  snapshot: makeSnapshot({
    headers: [
      { name: 'Server', value: 'cloudflare' },
      { name: 'CF-RAY', value: '87c56b50ab8a1bce-iad' },
      { name: 'content-type', value: 'text/html; charset=utf-8' },
    ],
  }),
  expected: ['cloudflare'],
  forbidden: ['nginx', 'apache', 'iis'],
}
```

### 6.2 PrestaShop fixture

```typescript
{
  name: 'prestashop',
  description: 'PrestaShop e-commerce site identified via generator meta tag',
  category: 'cms',
  snapshot: makeSnapshot({
    headers: [
      { name: 'Server', value: 'nginx/1.21' },
      { name: 'X-Powered-By', value: 'PHP/8.2' },
    ],
    metaTags: [
      { name: 'generator', content: 'PrestaShop 1.7.8.10' },
    ],
  }),
  expected: ['prestashop'],
  forbidden: ['wordpress', 'drupal', 'hugo', 'jekyll', 'ghost', 'laravel'],
}
```

### 6.3 Plausible fixture

```typescript
{
  name: 'plausible',
  description: 'Plausible Analytics via script URL containing plausible.io',
  category: 'analytics',
  snapshot: makeSnapshot({
    scripts: [
      { src: 'https://plausible.io/js/script.js', content: '' },
      { src: 'https://plausible.io/js/script.local.js', content: '' },
    ],
  }),
  expected: ['plausible'],
  forbidden: ['google-analytics', 'shopify', 'bootstrap'],
}
```

---

## 7. Negative / False-Positive Fixtures

### 7.1 Plausible substring false positive

```typescript
{
  name: 'false-positive-plausible-substring',
  description: "Script URL containing 'plausible' but NOT 'plausible.io' — must NOT match Plausible Analytics",
  category: 'negative',
  snapshot: makeSnapshot({
    scripts: [
      { src: 'https://example.com/js/plausible-analytics.js', content: '' },
    ],
  }),
  expected: [],
  forbidden: ['plausible', 'google-analytics'],
}
```

This verifies that `plausible.io` is a domain-level match — a script URL containing "plausible" as a substring of a path (not the domain) does NOT trigger detection.

### 7.2 Cloudflare cross-header false positive

```typescript
{
  name: 'false-positive-cloudflare-x-powered-by',
  description: "X-Powered-By header containing 'cloudflare' — must NOT match Cloudflare (signature is on Server header only)",
  category: 'negative',
  snapshot: makeSnapshot({
    headers: [
      { name: 'Server', value: 'unknown-server/1.0' },
      { name: 'X-Powered-By', value: 'cloudflare-protection' },
    ],
  }),
  expected: [],
  forbidden: ['cloudflare', 'apache', 'iis', 'nginx', 'php', 'express'],
}
```

This verifies that the Cloudflare signature only matches the `Server` header, not other headers that may contain "cloudflare" in their values.

---

## 8. Positive Fixtures Added

3 new positive fixtures added:

- `cloudflare` — `cdn` category, verifies Cloudflare detection via `Server` header
- `prestashop` — `cms` category, verifies PrestaShop detection via meta generator
- `plausible` — `analytics` category, verifies Plausible detection via script URL

Each includes:

- Multiple observation sources where realistic (e.g., PrestaShop fixture has Server + X-Powered-By headers alongside the generator meta tag)
- `expected` list with the new technology ID
- `forbidden` list with related technologies that should NOT be detected

---

## 9. Golden Fixture Integration

### 9.1 Coverage verification

The golden fixture test (`golden-fixtures.test.ts`) automatically picks up the new fixtures since they are exported from `FIXTURES`. The test generates:

- One test per fixture for `detects all expected technologies`
- One test per fixture for `does NOT detect any forbidden technologies`
- One test per fixture for `produces deterministic results across 3 runs`

### 9.2 Catalog coverage check

The `catalog coverage > every catalog technology (except infrastructure) has a positive fixture` test will verify:

- `cloudflare` — positive fixture added ✅
- `prestashop` — positive fixture added ✅
- `plausible` — positive fixture added ✅

The `every catalog technology appears in the coverage report` test will verify:

- `cloudflare` — appears in `cloudflare` fixture's `expected` list ✅
- `prestashop` — appears in `prestashop` fixture's `expected` list ✅
- `plausible` — appears in `plausible` fixture's `expected` list ✅
- Also automatically appears in `no-fingerprint` and `noise` fixtures' `forbidden: [...ALL_TECH_IDS]` lists ✅

---

## 10. Coexistence Tests

The existing coexistence fixtures verify that multiple technologies can be detected independently in the same snapshot:

- `nextjs-react-coexist` — Next.js + React
- `wordpress-woocommerce-coexist` — WordPress + WooCommerce

No new coexistence fixtures were needed for Step 19 candidates because:

- Cloudflare (CDN) is infrastructure, not an application framework
- PrestaShop (CMS) is a standalone e-commerce CMS — does not co-occur with other catalog technologies
- Plausible (analytics) is a standalone analytics tool — does not co-occur with other catalog technologies

The existing coexistence tests provide sufficient coverage for the coexistence pattern.

---

## 11. Regression Checks

### 11.1 No existing fixture broken

- All 29 positive fixtures: verified that new signatures do not produce false positives on existing positive fixtures
- The PrestaShop `prestashop` signature matches only `generator` meta content containing `prestashop` — no existing fixture's meta tags contain this string
- The Cloudflare `cloudflare` signature matches only the `Server` header — no existing fixture's `Server` header contains `cloudflare`
- The Plausible `plausible.io` signature matches script URLs — no existing fixture has script URLs containing `plausible.io`
- The `nextjs` fixture has `Server: vercel` which does NOT match `cloudflare` ✅

### 11.2 Golden fixtures remain green

- All 109 tests in `golden-fixtures.test.ts` continue to pass
- 5 new tests added (3 positive fixtures × 3 tests + 2 false-positive fixtures × 3 tests = 15 new tests)
- Total: 109 + 15 = **124 tests**

---

## 12. Catalog Completeness Test

### 12.1 Existing completeness checks

The `golden-fixtures.test.ts` already includes two catalog completeness tests:

1. **`every catalog technology (except infrastructure) has a positive fixture`** — checks that every technology ID in the catalog has at least one positive fixture or appears in at least one fixture's expected list.

2. **`every catalog technology appears in the coverage report`** — checks that every technology ID appears in at least one fixture's `expected` or `forbidden` list.

### 12.2 Verification

Both completeness tests pass after adding the 3 new technologies because:

- `cloudflare`, `prestashop`, `plausible` are all added to `ALL_TECH_IDS`
- All 3 appear in positive fixtures' `expected` lists
- All 3 appear in `no-fingerprint` and `noise` fixtures' `forbidden: [...ALL_TECH_IDS]` lists (auto-included)

No additional test file was needed — the existing completeness checks automatically validate the new entries.

---

## 13. Documentation Updates

- `docs/architecture/detectors.md`:
  - Updated HeaderDetector signature table (added Cloudflare)
  - Updated MetaTagDetector signature table (added PrestaShop)
  - Updated ScriptUrlDetector signature table (added Plausible + WooCommerce was missing from docs table)
  - Updated catalog table (added 3 entries)
  - Updated category table (added `cdn` category, updated `cms` and `analytics` rows)
  - Updated "Step 11 — New technologies added" table (added 3 entries)

- `docs/architecture/domain-model.md`: No changes needed — technology IDs are dynamically resolved from the catalog, no model change required.

---

## 14. Precision Risk Assessment

| Technology | False-positive scenario                                | Risk level | Mitigation                                                                      |
| ---------- | ------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------- |
| Cloudflare | Another CDN mimics `Server: cloudflare`                | Very low   | `Server` header is infrastructure-set, hard to spoof accidentally               |
| PrestaShop | Generic site mentions "prestashop" in generator meta   | Very low   | Meta generator is CMS-controlled; only PrestaShop sets this                     |
| Plausible  | Script URL contains "plausible" but not "plausible.io" | Very low   | Signature uses `plausible.io` (domain-level), covered by false-positive fixture |

**Overall precision risk: minimal.** All 3 signatures use specific, technology-controlled signals (Server header, meta generator, dedicated script domain) — consistent with the existing detection methodology.

---

## 15. What Was NOT Changed (Constraints Honored)

- ✅ No new detector created (all 3 signatures added to existing detectors)
- ✅ No new evidence type (all use existing `http_header`, `meta_tag`, `script_url`)
- ✅ No scoring algorithm change (confidences are static, same as existing)
- ✅ No crawler change
- ✅ No snapshot contract change
- ✅ No network probing or external scraping
- ✅ No duplicate catalog entries
- ✅ No generic keyword heuristics
- ✅ No probabilistic detection
- ✅ No new external dependencies

---

## 16. Validation Results

| Check                                                | Result                                        |
| ---------------------------------------------------- | --------------------------------------------- |
| `pnpm typecheck`                                     | ✅ Pass                                       |
| `pnpm test`                                          | ✅ Pass (857 tests passed, 9 skipped)         |
| `pnpm lint`                                          | ✅ Pass                                       |
| `pnpm build`                                         | ✅ Pass                                       |
| `npx madge --circular --extensions ts packages apps` | ✅ 0 circular deps                            |
| Golden fixtures regression                           | ✅ All 109 original + 15 new = 124 tests pass |
| Catalog completeness                                 | ✅ All 32 technologies covered                |
