# Crawler Architecture

## Overview

The `@devlens/crawler` package implements website observation for DevLens.
It contains the `Crawler` interface (the boundary contract) and a concrete
`HttpCrawler` implementation using Node.js 24 native `fetch`.

```text
Crawler (interface)
   ↓
HttpCrawler
   ↓
native fetch
   ↓
SiteSnapshot (domain)
```

## Crawler Boundary

The `Crawler` interface defines the contract between the DevLens domain
(`@devlens/core`) and the crawler implementation:

```typescript
interface Crawler {
  crawl(target: ScanTarget): Promise<SiteSnapshot>;
}
```

The crawler receives an immutable `ScanTarget` and produces an independent
`SiteSnapshot`. It does **not** know about `ScanStatus` or `ScanError` —
the application layer is responsible for advancing the scan lifecycle.

## HttpCrawler

`HttpCrawler` is the concrete implementation. It depends on `@devlens/core`
for domain types and uses only the Node.js 24 runtime (native `fetch`,
`AbortController`, `URL`, `TextDecoder`). No external HTTP library is used.

### Constructor

```typescript
new HttpCrawler(options?: HttpCrawlerOptions)
```

| Option             | Type           | Default                                |
| ------------------ | -------------- | -------------------------------------- |
| `timeoutMs`        | `number`       | 10000 (10 seconds)                     |
| `userAgent`        | `string`       | `DevLens/0.1 (+https://devlens.local)` |
| `maxBodyBytes`     | `number`       | 5_242_880 (5 MiB)                      |
| `maxRedirects`     | `number`       | 10                                     |
| `maxCssResources`  | `number`       | 5                                      |
| `maxResourceBytes` | `number`       | 524_288 (512 KiB)                      |
| `fetch`            | `typeof fetch` | `globalThis.fetch` (native)            |

`maxCssResources` limits the number of same-origin CSS files fetched per
scan. `maxResourceBytes` caps each individual resource body. Both
limits are part of the Step 6H resource-observation feature — they
prevent excessive network activity during resource observation.

The `fetch` option exists primarily for testing. In production, the native
global `fetch` is used.

### HTTP Behaviour

- **Method:** `GET`
- **Headers:** `User-Agent` (configurable, defaults to `DevLens/0.1 (+https://devlens.local)`)
  and `Accept: text/html,application/xhtml+xml`
- **Redirects:** Followed manually (using `redirect: 'manual'`). This allows
  SSRF checking on each redirect target and enforces `maxRedirects` (default: 10).
  The original `ScanTarget.url` is never modified; the final URL is captured in
  `SiteSnapshot.http.finalUrl`.
- **Timeout:** Enforced via `AbortController` + `setTimeout`. When the timeout
  fires, the signal is aborted and the crawler throws `CrawlError` with code
  `'timeout'`. The timer is cleared in a `finally` block.
- **Body size limit:** Enforced in two stages:
  1. **Fast path:** If the `Content-Length` header is present and exceeds
     `maxBodyBytes`, the request is rejected immediately without reading any body.
  2. **Streaming path:** If `Content-Length` is absent or misleading, the body is
     read chunk-by-chunk via `ReadableStream.getReader()`. If the accumulated
     size exceeds `maxBodyBytes`, reading stops and `CrawlError` with code
     `'too_large'` is thrown.

## HTML extraction

The crawler extracts metadata from the HTML response body using
`extractHtml()` in `html-parser.ts`. This is a lightweight, regex-based
extraction — not a full DOM parser. It captures:

- `<title>` — the page title
- `<meta name="description" content="...">` — the meta description
- All `<meta name="..." content="...">` tags — stored as `MetaTag[]`
- All `<script>` tags — stored as `{ src: string | null, content: string }[]`
- All `<link>` tags — stored as (`LinkTag[]`) with `{ rel, href, content }`
- `<link rel="stylesheet" href="...">` hrefs — stored as `string[]` (for
  controlled resource observation in Step 6H)
- `<link rel="manifest" href="...">` href — stored as `string | null` (Step 6H)

The extracted `HtmlObservation` is stored in `SiteSnapshot.html` and is
consumed by `HeaderDetector`, `MetaTagDetector`, `ScriptUrlDetector`,
`ContentScriptDetector`, and `LinkDetector`.

Link tags are extracted in document order. Tags without an `href`
attribute are included (with `href: null`) so that `rel`-based analysis
is possible, but detectors that require a URL will skip them.

- **HTTP status:** All HTTP status codes (2xx, 3xx, 4xx, 5xx) that receive a
  response are valid observations. The status code is converted to a domain
  `HttpStatus` via `createHttpStatus()`. Only network-level failures (no
  response received) produce errors.

### HTML Extraction

The crawler extracts `<title>`, `<meta name="description">`, all
`<meta name="..." content="...">` tags, and all `<script>` tags from the
response body. The extraction is regex-based (no DOM parser, no external
HTML library) and handles:

- Case-insensitive tag names (`<TITLE>`, `<title>`, `<Title>`)
- Case-insensitive attribute names (`NAME`, `name`)
- Attribute order variation (`<meta content="..." name="description">`)
- Double-quoted, single-quoted, and unquoted attribute values
- Missing or malformed HTML

For non-HTML responses (`Content-Type` not `text/html` or `application/xhtml+xml`),
no HTML parsing is performed — `title` defaults to `''`, `description` to
`null`, and `metaTags`/`scripts` to `[]`. When the page is non-HTML,
resource observation is skipped entirely (no robots, manifest, or CSS
fetching occurs).

### Resource Observation (Step 6H)

After extracting the main page HTML, the crawler performs **controlled
resource observation** — a limited, same-origin-only fetch of a few
high-value resource types. This is **observation only**: no
`ResourceDetector` runs on observed resources, no JavaScript bundle
fetching occurs, and no scoring or health metrics are computed from
these resources.

**Observed resource types:**

| Type       | How discovered                       | Content-Type accepted                             |
| ---------- | ------------------------------------ | ------------------------------------------------- |
| `robots`   | Derived from `<origin>/robots.txt`   | `text/plain`, `text/html`, or empty               |
| `manifest` | `<link rel="manifest" href="...">`   | `application/manifest+json` or `application/json` |
| `css`      | `<link rel="stylesheet" href="...">` | `text/css` or `application/css`                   |

**Observation pipeline (`observeResources`):**

1. **robots.txt** — URL is derived from the page origin
   (`new URL(pageUrl).origin + '/robots.txt'`).
2. **manifest** — URL comes from `<link rel="manifest">`, resolved
   against the page URL. Only the first manifest link is followed.
3. **CSS** — URLs come from all `<link rel="stylesheet">` tags,
   resolved against the page URL. Duplicate URLs are deduplicated via a
   `Set` and the total count is capped at `maxCssResources` (default 5).

Each resource is fetched via `fetchResource()`, which applies:

- **SSRF protection** — `isResourceUrlAllowed()` rejects non-`http:`/
  `https:` schemes, blocked hostnames, and cross-origin hostnames.
- **Redirect checking** — redirects are followed manually (`redirect:
'manual'`); cross-origin redirect targets are rejected.
- **Content-Type validation** — the response `Content-Type` must be
  compatible with the expected resource type (see table above).
- **Body size limit** — each body is read via `readBodyWithLimit()`
  with a `maxResourceBytes` cap (default 512 KiB).

**Failure isolation:** every resource fetch is wrapped in its own
try/catch. A single failed resource (timeout, 404, wrong content-type,
body too large, malformed URL) is silently skipped — it never causes
the overall crawl to fail.

**Abort propagation:** the crawl's `AbortController` signal is passed
to each resource fetch. If the crawl timeout fires during resource
observation, pending resource fetches are aborted and skipped; already-
collected resources are still stored in the snapshot.

### Error Model

`CrawlError` is an infrastructure-level error with a `code` property:

| Code             | When produced                                    |
| ---------------- | ------------------------------------------------ |
| `invalid_target` | Target URL resolves to a private/internal host   |
| `timeout`        | Request exceeded `timeoutMs`                     |
| `network_error`  | DNS failure, connection refused, fetch rejection |
| `too_large`      | Response body exceeds `maxBodyBytes`             |

HTTP 4xx/5xx responses are **not** errors — they produce valid `SiteSnapshot`
objects. The distinction is:

- **Network failure** (no response) → `CrawlError`
- **HTTP error response** (4xx, 5xx received) → `SiteSnapshot` with the status code

### SSRF Protection

The crawler includes a basic hostname/IP blocklist (`ssrf-guard.ts`) that
blocks requests to:

- `localhost` and `*.localhost`
- `127.0.0.0/8` (IPv4 loopback)
- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (private ranges)
- `0.0.0.0` (unspecified)
- `169.254.0.0/16` (IPv4 link-local)
- `::1`, `fc00::/7`, `fe80::/10` (IPv6 private ranges)

**Known limitations:**

- Does not protect against **DNS rebinding** (attacker returns public IP on
  first resolution, private IP on second). Full protection requires DNS-level
  validation at the socket layer.
- Redirect targets are checked, but a redirect could resolve to a different IP
  after the hostname check passes.

For production deployments, SSRF protection should be enforced at the
application boundary (network policy or dedicated proxy), not solely at the
crawler level.

## What the Crawler Does NOT Do

- Execute JavaScript or wait for page hydration
- Crawl the full resource tree (images, fonts, videos, async JS chunks, etc.)
- Detect technologies (React, Next.js, WordPress, etc.)
- Calculate scores, confidence, or health metrics
- Store anything — it produces a `SiteSnapshot` and returns it
- Use Playwright, a headless browser, or any browser API

## Testability

All tests are deterministic and use no internet access. Tests inject a mock
`fetch` implementation via the `HttpCrawlerOptions.fetch` option. The mock
returns `Response` objects created with Node.js 24's global `Response`
constructor.

## File Structure

```text
packages/crawler/src/
├── crawler.ts           # Crawler interface (boundary contract)
├── crawl-error.ts       # CrawlError class + CrawlErrorCode type
├── html-parser.ts       # extractHtml() — title + meta description + all meta tags + all script tags
├── ssrf-guard.ts        # isBlockedHostname() — SSRF protection
├── http-crawler.ts      # HttpCrawler class (Crawler implementation)
├── index.ts             # Public API exports
├── test-helpers.ts      # Shared test helpers (mockFetch, htmlResponse, makeTarget, etc.)
├── http-crawler.test.ts # 39 tests (22 basic + 17 resource observation/security)
├── snapshot-determinism.test.ts     # 9 tests (structural equality, ordering, stability)
├── snapshot-normalization.test.ts    # 15 tests (URL handling, headers, content-type)
├── crawler-observation-coverage.test.ts # 28 tests (coverage matrix per surface)
├── crawler-edge-cases.test.ts        # 27 tests (redirects, encoding, malformed, limits)
└── html-parser.test.ts  # 49 tests (meta tag + title/description + script + link extraction)
```

## Dependency Direction

```text
@devlens/core
      ↑
      │
@devlens/crawler
      │
      └── native fetch (runtime)
```

`@devlens/crawler` depends on `@devlens/core` for domain types. `@devlens/core`
does **not** depend on `@devlens/crawler`. There are no circular dependencies.
