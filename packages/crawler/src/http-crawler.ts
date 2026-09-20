/**
 * HttpCrawler — concrete implementation of the {@link Crawler} interface
 * using Node.js 24 native `fetch`.
 *
 * Architecture:
 *
 * ```text
 * Crawler (interface)
 *    ↓
 * HttpCrawler (this class)
 *    ↓
 * native fetch
 *    ↓
 * SiteSnapshot (domain)
 * ```
 *
 * The crawler is responsible for:
 * - Making an HTTP GET request to the target URL
 * - Following redirects (manually, for SSRF protection)
 * - Enforcing a timeout via AbortController
 * - Enforcing a maximum body size (Content-Length check + streaming read)
 * - Extracting HTML metadata (title, meta tags, scripts)
 * - Observing controlled resources (robots.txt, manifest.json, same-origin CSS)
 * - Converting the raw HTTP response into a domain-valid {@link SiteSnapshot}
 *
 * The crawler does NOT:
 * - Parse or execute JavaScript
 * - Crawl arbitrary links recursively
 * - Detect technologies
 * - Store anything — it produces a `SiteSnapshot` and returns it
 * - Fetch JavaScript bundles
 *
 * HTTP 4xx/5xx responses are valid observations (produce snapshots).
 * Only network-level failures (DNS, connection refused, timeout, body
 * too large) produce {@link CrawlError}.
 */

import type { Crawler } from './crawler.js';
import type { HttpHeader, Resource, ResourceType, ScanTarget, SiteSnapshot } from '@devlens/core';
import { createUrl, createHostname, createTimestamp, createHttpStatus } from '@devlens/core';
import { CrawlError } from './crawl-error.js';
import { isBlockedHostname, isResourceUrlAllowed, isResourceFetchable } from './ssrf-guard.js';
import { extractHtml, type HtmlExtract } from './html-parser.js';
import {
  discoverResources,
  selectResources,
  classifyResource,
  compareResources,
} from './resource-intelligence.js';
import type { ResourcePolicy } from './resource-intelligence.js';

// ─── Configuration ─────────────────────────────────────────────────

/**
 * Options for constructing an {@link HttpCrawler}.
 *
 * All options are optional with sensible defaults. The `fetch` option
 * exists primarily for testing — when omitted, the native global `fetch`
 * is used.
 */
export interface HttpCrawlerOptions {
  /** Request timeout in milliseconds. Default: 10000 (10s). */
  readonly timeoutMs?: number;
  /** User-Agent header value. Default: `DevLens/0.1 (+https://devlens.local)`. */
  readonly userAgent?: string;
  /** Maximum response body size in bytes. Default: 5_242_880 (5 MiB). */
  readonly maxBodyBytes?: number;
  /** Maximum number of redirects to follow. Default: 10. */
  readonly maxRedirects?: number;
  /** Custom fetch implementation (for testing). */
  readonly fetch?: typeof fetch;
  /** Maximum number of same-origin CSS resources to observe. Default: 5. */
  readonly maxCssResources?: number;
  /** Maximum body size in bytes for observed resources. Default: 524288 (512 KiB). */
  readonly maxResourceBytes?: number;
  /**
   * Optional HTTP Resource Intelligence policy (Step 70).
   *
   * When **absent** (the default) the crawler uses the original controlled
   * resource observation path (robots.txt, manifest, same-origin CSS only)
   * — behavior is byte-identical to a crawler built without this option, so
   * existing tests and fixtures are unaffected.
   *
   * When present, the crawler instead runs the full
   * discover → select → acquire pipeline over scripts, stylesheets,
   * favicons, manifest, and robots, bounded by the policy. Every secondary
   * request reuses the existing SSRF/same-origin security boundary
   * (`isResourceFetchable`), so the option can only *narrow* what is fetched,
   * never broaden the security boundary.
   */
  readonly resourceIntelligence?: ResourcePolicy;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MiB
const DEFAULT_MAX_REDIRECTS = 10;
const DEFAULT_USER_AGENT = 'DevLens/0.1 (+https://devlens.local)';
const DEFAULT_MAX_CSS_RESOURCES = 5;
const DEFAULT_MAX_RESOURCE_BYTES = 512 * 1024; // 512 KiB

// ─── Constants ───────────────────────────────────────────────────────

/** HTTP status codes that trigger a redirect. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Content-Type media types recognized as HTML. */
const HTML_CONTENT_TYPES = new Set(['text/html', 'application/xhtml+xml']);

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Checks if an HTTP status code is a redirect status.
 *
 * Uses the standard set {301, 302, 303, 307, 308}. Status 300 (Multiple
 * Choices) and 304 (Not Modified) are not treated as redirects.
 */
function isRedirect(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

/**
 * Extracts the media type from a Content-Type header value.
 *
 * `text/html; charset=utf-8` → `text/html`
 * `application/xhtml+xml` → `application/xhtml+xml`
 * Returns `''` for empty or null values.
 */
function mediaTypeOf(contentType: string | null): string {
  if (!contentType) {
    return '';
  }
  const semicolonIndex = contentType.indexOf(';');
  const mediaType = semicolonIndex >= 0 ? contentType.slice(0, semicolonIndex) : contentType;
  return mediaType.trim().toLowerCase();
}

/**
 * Checks if a Content-Type value indicates an HTML response.
 */
function isHtmlContentType(contentType: string | null): boolean {
  return HTML_CONTENT_TYPES.has(mediaTypeOf(contentType));
}

/**
 * Checks if a response Content-Type is compatible with the expected resource
 * type.
 *
 * - `robots` accepts `text/plain`, `text/html`, or a missing/loose Content-Type
 *   (many servers serve robots.txt with no Content-Type or with `text/html`).
 * - `css` accepts `text/css` or `application/css` (the IANA-registered MIME
 *   type for CSS, used by some CDNs).
 * - `manifest` accepts `application/manifest+json` or `application/json`.
 * - Other types accept any Content-Type.
 */
function isContentTypeCompatible(type: ResourceType, contentType: string | null): boolean {
  const mediaType = mediaTypeOf(contentType);

  if (type === 'robots') {
    return mediaType === 'text/plain' || mediaType === 'text/html' || mediaType === '';
  }
  if (type === 'css') {
    return mediaType === 'text/css' || mediaType === 'application/css';
  }
  if (type === 'manifest') {
    return mediaType === 'application/manifest+json' || mediaType === 'application/json';
  }
  return true;
}

/**
 * Converts a native `Headers` object into the domain's `HttpHeader[]`.
 *
 * Header names are normalized to lowercase per HTTP/2 conventions.
 * The order of headers is preserved as returned by the implementation.
 */
function convertHeaders(headers: Headers): HttpHeader[] {
  const result: HttpHeader[] = [];
  headers.forEach((value, name) => {
    result.push({ name: name.toLowerCase(), value });
  });
  return result;
}

/**
 * Extracts the charset from a Content-Type header value.
 *
 * `text/html; charset=iso-8859-1` → `iso-8859-1`
 * `text/html; charset="utf-8"`  → `utf-8`
 * `text/html`                  → `utf-8` (default)
 * `null`                       → `utf-8` (default)
 *
 * The charset value is normalized to lowercase. Quotes around the value
 * (e.g. `charset="utf-8"`) are stripped. If no charset is specified,
 * `utf-8` is returned as the default.
 */
function extractCharset(contentType: string | null): string {
  if (!contentType) {
    return 'utf-8';
  }
  const match = /charset=([^;,\s]+)/i.exec(contentType);
  if (!match || match[1] === undefined) {
    return 'utf-8';
  }
  return match[1]
    .replace(/^['"]|['"]$/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Creates a `TextDecoder` for the given charset, falling back to UTF-8
 * if the charset is unsupported by the runtime.
 */
function createTextDecoder(charset: string): TextDecoder {
  try {
    return new TextDecoder(charset);
  } catch {
    return new TextDecoder('utf-8');
  }
}

/**
 * Reads the response body as text with a size limit.
 *
 * Fast path: if the `Content-Length` header is present and exceeds the
 * limit, the error is thrown immediately without reading any body bytes.
 *
 * Fallback: if `Content-Length` is absent or misleading, the body is read
 * chunk-by-chunk via `ReadableStream` and the limit is enforced during
 * streaming. This prevents unbounded memory consumption.
 *
 * Returns `{ text, bytes }` where `text` is the decoded string and `bytes`
 * is the actual byte count read from the stream.
 */
async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; bytes: number }> {
  // ── Fast path: Content-Length check ───────────────────────────────
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new CrawlError(
        'too_large',
        `Content-Length ${contentLength} exceeds limit of ${maxBytes} bytes`,
      );
    }
  }

  // ── Body reading with streaming limit ─────────────────────────────
  if (!response.body) {
    return { text: '', bytes: 0 };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value !== undefined) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          throw new CrawlError('too_large', `Response body exceeds limit of ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  // ── Decode using charset from Content-Type (default: UTF-8) ───────
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const charset = extractCharset(response.headers.get('content-type'));
  const decoder = createTextDecoder(charset);
  return { text: decoder.decode(combined), bytes: totalLength };
}

/**
 * Builds a `Resource` observation for a resource that was never acquired
 * (blocked by the security gate or excluded by the selection budget).
 * Never fabricates content — the body is empty and size is unknown.
 */
function skippedResource(
  url: string,
  type: ResourceType,
  sourcePage: string,
  failureReason: string,
): Resource {
  return {
    url: createUrl(url),
    type,
    size: null,
    content: '',
    httpStatus: createHttpStatus(200),
    contentType: null,
    sourcePage: createUrl(sourcePage),
    acquisitionStatus: 'skipped',
    failureReason,
  };
}

/**
 * Builds a `Resource` observation for a resource that was acquired but
 * failed (non-2xx, timeout, network error, body too large, etc.).
 * `httpStatus` defaults to 200 (the "discovered from markup" convention)
 * when no HTTP response is available.
 */
function failedResource(
  url: string,
  type: ResourceType,
  sourcePage: string,
  failureReason: string,
  httpStatus: number = 200,
): Resource {
  return {
    url: createUrl(url),
    type,
    size: null,
    content: '',
    httpStatus: createHttpStatus(httpStatus),
    contentType: null,
    sourcePage: createUrl(sourcePage),
    acquisitionStatus: 'failed',
    failureReason,
  };
}

// ─── HttpCrawler ────────────────────────────────────────────────────

/**
 * HTTP crawler implementation using Node.js 24 native `fetch`.
 *
 * Implements the {@link Crawler} interface. Given a {@link ScanTarget},
 * performs an HTTP GET, follows redirects (manually, for SSRF protection),
 * applies timeout and body-size limits, and produces a {@link SiteSnapshot}.
 *
 * HTTP errors (4xx, 5xx) are treated as valid observations — they produce
 * a snapshot with the response's status code. Only network-level failures
 * (DNS, connection refused, timeout, body too large) produce {@link CrawlError}.
 */
export class HttpCrawler implements Crawler {
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly maxBodyBytes: number;
  private readonly maxRedirects: number;
  private readonly fetchFn: typeof fetch;
  private readonly maxCssResources: number;
  private readonly maxResourceBytes: number;
  private readonly resourcePolicy: ResourcePolicy | undefined;

  constructor(options?: HttpCrawlerOptions) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;
    this.maxBodyBytes = options?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    this.maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.fetchFn = options?.fetch ?? globalThis.fetch;
    this.maxCssResources = options?.maxCssResources ?? DEFAULT_MAX_CSS_RESOURCES;
    this.maxResourceBytes = options?.maxResourceBytes ?? DEFAULT_MAX_RESOURCE_BYTES;
    this.resourcePolicy = options?.resourceIntelligence;
  }

  /**
   * Crawls the target URL and produces a {@link SiteSnapshot}.
   *
   * @throws {CrawlError} if the crawl fails at the network/transport level.
   */
  async crawl(target: ScanTarget): Promise<SiteSnapshot> {
    // ── 1. Validate target (SSRF check) ─────────────────────────────
    const parsedUrl = new URL(target.url);
    if (isBlockedHostname(parsedUrl.hostname)) {
      throw new CrawlError(
        'invalid_target',
        `Blocked request to private/internal host: ${parsedUrl.hostname}`,
      );
    }

    // ── 2. Set up timeout ─────────────────────────────────────────────
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      // ── 3. Fetch with manual redirect handling ───────────────────────
      let currentUrl: string = target.url;
      let redirectCount = 0;
      let response: Response;

      while (true) {
        response = await this.fetchFn(currentUrl, {
          method: 'GET',
          headers: {
            'User-Agent': this.userAgent,
            Accept: 'text/html,application/xhtml+xml',
          },
          redirect: 'manual',
          signal: abortController.signal,
        });

        if (isRedirect(response.status)) {
          redirectCount++;
          if (redirectCount > this.maxRedirects) {
            throw new CrawlError(
              'network_error',
              `Exceeded maximum redirects (${this.maxRedirects})`,
            );
          }

          const location = response.headers.get('location');
          if (!location) {
            throw new CrawlError('network_error', 'Redirect response missing Location header');
          }

          const nextUrl = new URL(location, currentUrl).href;
          const redirectHost = new URL(nextUrl).hostname;
          if (isBlockedHostname(redirectHost)) {
            throw new CrawlError(
              'invalid_target',
              `Blocked redirect to private/internal host: ${redirectHost}`,
            );
          }

          currentUrl = nextUrl;
          continue;
        }

        break;
      }

      // ── 4. Read body (with size limit) ───────────────────────────────
      const isHtml = isHtmlContentType(response.headers.get('content-type'));

      let bodyText: string;
      try {
        const result = await readBodyWithLimit(response, this.maxBodyBytes);
        bodyText = result.text;
      } catch (error) {
        if (error instanceof CrawlError) {
          throw error;
        }
        throw new CrawlError('network_error', 'Failed to read response body', { cause: error });
      }

      // ── 5. Extract HTML metadata ────────────────────────────────────
      const finalUrl = currentUrl;
      const finalHostname = new URL(finalUrl).hostname;
      const contentType = response.headers.get('content-type') ?? '';
      const domainHeaders = convertHeaders(response.headers);

      let title: string;
      let description: string | null;
      let metaTags: Array<{ name: string; content: string }>;
      let scripts: Array<{ src: string | null; content: string }>;
      let links: Array<{ rel: string | null; href: string | null; content: string }>;
      let extract: HtmlExtract | null = null;

      if (isHtml) {
        extract = extractHtml(bodyText);
        title = extract.title;
        description = extract.description;
        metaTags = extract.metaTags;
        scripts = extract.scripts;
        links = extract.linkTags;
      } else {
        title = '';
        description = null;
        metaTags = [];
        scripts = [];
        links = [];
      }

      // ── 6. Observe controlled resources ───────────────────────────────
      // Resource observation errors never fail the crawl — only the
      // resources that were successfully fetched are included. When the
      // Step-70 resource-intelligence policy is absent, the original
      // observeResources path runs (byte-identical prior behavior). When it
      // is present, the deterministic discover → select → acquire pipeline
      // runs instead.
      const resources =
        extract !== null
          ? this.resourcePolicy !== undefined
            ? await this.intelligentResources(
                finalUrl,
                finalHostname,
                extract,
                abortController.signal,
              )
            : await this.observeResources(finalUrl, finalHostname, extract, abortController.signal)
          : [];

      // ── 7. Build domain structures ──────────────────────────────────
      return {
        url: createUrl(finalUrl),
        hostname: createHostname(finalHostname),
        capturedAt: createTimestamp(new Date()),
        http: {
          statusCode: createHttpStatus(response.status),
          headers: domainHeaders,
          contentType,
          finalUrl: createUrl(finalUrl),
        },
        html: {
          title,
          description,
          metaTags,
          scripts,
          links,
        },
        resources,
      };
    } catch (error) {
      if (error instanceof CrawlError) {
        throw error;
      }

      if (abortController.signal.aborted) {
        throw new CrawlError('timeout', `Request timed out after ${this.timeoutMs}ms`, {
          cause: error,
        });
      }

      throw new CrawlError('network_error', 'Request failed', { cause: error });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─── Resource observation ──────────────────────────────────────────

  /**
   * Observes controlled resources from the crawled page.
   *
   * Fetches `robots.txt`, the manifest, and same-origin CSS resources
   * referenced by `<link>` tags. Each resource fetch is independently
   * guarded — failures (timeouts, network errors, too-large bodies)
   * are silently skipped so a single bad resource never fails the crawl.
   *
   * @param pageUrl     Final URL of the crawled page (after redirects).
   * @param targetHostname Hostname to enforce same-origin policy against.
   * @param extract     Parsed HTML metadata from {@link extractHtml}.
   * @param signal      Aborted when the crawl timeout fires.
   */
  private async observeResources(
    pageUrl: string,
    targetHostname: string,
    extract: HtmlExtract,
    signal: AbortSignal,
  ): Promise<Resource[]> {
    const resources: Resource[] = [];

    // 1. robots.txt — always derived from the page origin
    try {
      const pageOrigin = new URL(pageUrl).origin;
      const robotsUrl = `${pageOrigin}/robots.txt`;
      const robotsResource = await this.fetchResource(robotsUrl, targetHostname, 'robots', signal);
      if (robotsResource !== null) {
        resources.push(robotsResource);
      }
    } catch {
      /* robots.txt observation failed — continue */
    }

    // 2. manifest — from <link rel="manifest">
    try {
      if (extract.manifestLink !== null) {
        const manifestUrl = new URL(extract.manifestLink, pageUrl).href;
        const manifestResource = await this.fetchResource(
          manifestUrl,
          targetHostname,
          'manifest',
          signal,
        );
        if (manifestResource !== null) {
          resources.push(manifestResource);
        }
      }
    } catch {
      /* manifest observation failed — continue */
    }

    // 3. CSS — from <link rel="stylesheet">, same-origin, limited + deduplicated
    try {
      const seen = new Set<string>();
      let cssCount = 0;

      for (const link of extract.stylesheetLinks) {
        if (cssCount >= this.maxCssResources) {
          break;
        }

        let resolvedUrl: string;
        try {
          resolvedUrl = new URL(link, pageUrl).href;
        } catch {
          continue; // malformed URL — skip this resource
        }

        if (seen.has(resolvedUrl)) {
          continue;
        }
        seen.add(resolvedUrl);

        const cssResource = await this.fetchResource(resolvedUrl, targetHostname, 'css', signal);
        if (cssResource !== null) {
          resources.push(cssResource);
          cssCount++;
        }
      }
    } catch {
      /* CSS observation failed — continue */
    }

    return resources;
  }

  // ─── Step 70: resource intelligence (discover → select → acquire) ───

  /**
   * Runs the deterministic resource-intelligence pipeline when a
   * `resourceIntelligence` policy is configured.
   *
   * Discovers secondary resources from the HTML extract, selects a
   * deterministic budget-bounded subset (per §4/§6), acquires the selected
   * ones, and emits an observation for every discovered resource — fetched,
   * failed, or skipped — so the rationale ("why was this downloaded while
   * another was skipped?") is always reconstructible.
   *
   * Output is sorted by `(priority, url)` so the snapshot is independent of
   * fetch completion order (§14). A per-scan canonical-URL cache guarantees
   * no URL is fetched or observed twice (§15).
   */
  private async intelligentResources(
    pageUrl: string,
    targetHostname: string,
    extract: HtmlExtract,
    signal: AbortSignal,
  ): Promise<Resource[]> {
    const policy = this.resourcePolicy!; // guarded by caller (option-present)
    const discovered = discoverResources(extract, pageUrl, policy);
    const { selected, skipped } = selectResources(discovered, policy);

    const resources: Resource[] = [];
    // Bounded per-scan dedup cache: one canonical URL → one observation.
    const observedUrls = new Set<string>();

    // Resources excluded by the selection policy are still observable —
    // with a reason — so the budget decision is auditable.
    for (const r of skipped) {
      if (observedUrls.has(r.url)) {
        continue;
      }
      observedUrls.add(r.url);
      resources.push(skippedResource(r.url, r.kind, pageUrl, 'skipped: beyond selection budget'));
    }

    // Acquire the selected resources. Each is independently guarded: a
    // failure never fails the crawl, and never fabricates content.
    for (const r of selected) {
      if (observedUrls.has(r.url)) {
        continue;
      }
      observedUrls.add(r.url);
      try {
        resources.push(
          await this.acquireResource(r.url, r.kind, pageUrl, targetHostname, signal, policy),
        );
      } catch (error) {
        const reason =
          error instanceof CrawlError ? `acquisition_${error.code}` : 'acquisition_error';
        resources.push(failedResource(r.url, r.kind, pageUrl, reason));
      }
    }

    // Deterministic ordering independent of network completion order (§14).
    return resources.sort((a, b) => compareResources(a, b, policy));
  }

  /**
   * Acquires a single selected resource, reusing the existing HTTP/fetch
   * primitives (`fetchFn`, `readBodyWithLimit`, redirect handling, SSRF guard)
   * — no second HTTP client stack (§7).
   *
   * Always returns a `Resource` observation: `fetched` on success, `failed`
   * on a recoverable error (non-2xx, timeout, oversized, network), or
   * `skipped` when the SSRF/same-origin gate rejects the URL. Never throws
   * to the caller — acquisition errors are modeled as observations.
   */
  private async acquireResource(
    resourceUrl: string,
    kind: ResourceType,
    sourcePage: string,
    targetHostname: string,
    crawlSignal: AbortSignal,
    policy: ResourcePolicy,
  ): Promise<Resource> {
    // 1. Security gate — reuses the existing SSRF / same-origin boundary.
    //    `allowExternal` only controls cross-origin (public) hosts; the
    //    private-IP / scheme blocklist is always enforced.
    if (!isResourceFetchable(resourceUrl, targetHostname, policy.allowExternal)) {
      return skippedResource(
        resourceUrl,
        kind,
        sourcePage,
        'skipped: blocked by SSRF/same-origin policy',
      );
    }

    // Per-resource abort: bounded by policy.timeoutMs, and forwarded from
    // the crawl-level signal so a scan cancellation / crawl-wide timeout
    // still aborts in-flight acquisitions. The timer is cleared in `finally`
    // so test processes are never kept alive by pending timers.
    const resourceSignal = new AbortController();
    const timeoutId = setTimeout(() => resourceSignal.abort(), policy.timeoutMs);
    const forwardCrawlAbort = (): void => resourceSignal.abort();
    if (crawlSignal.aborted) {
      resourceSignal.abort();
    }
    crawlSignal.addEventListener('abort', forwardCrawlAbort, { once: true });

    try {
      return await this.runAcquisition(
        resourceUrl,
        kind,
        sourcePage,
        targetHostname,
        resourceSignal.signal,
        policy,
      );
    } finally {
      clearTimeout(timeoutId);
      crawlSignal.removeEventListener('abort', forwardCrawlAbort);
    }
  }

  /**
   * Inner acquisition routine. Given a signal that already carries the
   * per-resource timeout and crawl cancellation, performs the bounded fetch
   * and always returns an observable `Resource` (never throws).
   */
  private async runAcquisition(
    resourceUrl: string,
    kind: ResourceType,
    sourcePage: string,
    targetHostname: string,
    signal: AbortSignal,
    policy: ResourcePolicy,
  ): Promise<Resource> {
    let currentUrl = new URL(resourceUrl).href;
    let redirectCount = 0;
    let response: Response;

    // 2. Fetch with manual redirect following (no `redirect: 'follow'`).
    while (true) {
      try {
        response = await this.fetchFn(currentUrl, {
          method: 'GET',
          headers: { 'User-Agent': this.userAgent, Accept: '*/*' },
          redirect: 'manual',
          signal,
        });
      } catch {
        if (signal.aborted) {
          return failedResource(resourceUrl, kind, sourcePage, 'timeout');
        }
        return failedResource(resourceUrl, kind, sourcePage, 'network_error');
      }

      if (isRedirect(response.status)) {
        redirectCount++;
        if (redirectCount > policy.maxRedirects) {
          return failedResource(
            resourceUrl,
            kind,
            sourcePage,
            `redirect_chain_exceeded (${policy.maxRedirects})`,
            response.status,
          );
        }
        const location = response.headers.get('location');
        if (!location) {
          return failedResource(
            resourceUrl,
            kind,
            sourcePage,
            'redirect_missing_location',
            response.status,
          );
        }
        const nextUrl = new URL(location, currentUrl).href;
        // Re-validate the redirect destination (§5): a redirect must not
        // bypass the SSRF/same-origin gate.
        if (!isResourceFetchable(nextUrl, targetHostname, policy.allowExternal)) {
          return failedResource(
            resourceUrl,
            kind,
            sourcePage,
            'failed: blocked redirect destination',
            response.status,
          );
        }
        currentUrl = nextUrl;
        continue;
      }

      // Not a redirect: stop following and process the response.
      break;
    }

    // 3. Non-2xx is a valid, observable outcome — never a thrown error here.
    if (response.status < 200 || response.status >= 300) {
      return failedResource(
        resourceUrl,
        kind,
        sourcePage,
        `http_${response.status}`,
        response.status,
      );
    }

    // 4. Read body with size limit (bounded; textual bodies only).
    let body: string;
    let bodyBytes: number;
    try {
      const result = await readBodyWithLimit(response, policy.maxBodyBytes);
      body = result.text;
      bodyBytes = result.bytes;
    } catch (error: unknown) {
      const code = error instanceof CrawlError ? error.code : undefined;
      return failedResource(
        resourceUrl,
        kind,
        sourcePage,
        code === 'too_large' ? 'body_too_large' : 'body_read_error',
        response.status,
      );
    }

    // 5. Classify by response Content-Type (MIME may override the discovery
    //    context — §3). Favicon declared by HTML context is preserved.
    const contentType = response.headers.get('content-type');
    const resolvedKind = classifyResource(currentUrl, kind, contentType);

    return {
      url: createUrl(currentUrl),
      type: resolvedKind,
      size: bodyBytes,
      content: body,
      httpStatus: createHttpStatus(response.status),
      contentType: contentType ? mediaTypeOf(contentType) : null,
      sourcePage: createUrl(sourcePage),
      acquisitionStatus: 'fetched',
      responseHeaders: convertHeaders(response.headers),
    };
  }

  /**
   * Fetches a single resource with redirect-following, SSRF protection,
   * content-type validation, and a body-size limit.
   *
   * Returns a populated `Resource` on success, or `null` if the URL is
   * not allowed, the fetch fails, the response is non-2xx, the content
   * type is incompatible, or the body is too large.
   */
  private async fetchResource(
    resourceUrl: string,
    targetHostname: string,
    type: ResourceType,
    signal: AbortSignal,
  ): Promise<Resource | null> {
    // Validate URL scheme, same-origin, and SSRF
    if (!isResourceUrlAllowed(resourceUrl, targetHostname)) {
      return null;
    }

    // Resolve the URL and parse for redirect handling
    let currentUrl = new URL(resourceUrl).href;
    let redirectCount = 0;

    let response: Response;

    while (true) {
      try {
        response = await this.fetchFn(currentUrl, {
          method: 'GET',
          headers: { 'User-Agent': this.userAgent, Accept: '*/*' },
          redirect: 'manual',
          signal,
        });
      } catch {
        return null; // network/timeout error — skip resource
      }

      if (isRedirect(response.status)) {
        redirectCount++;
        if (redirectCount > this.maxRedirects) {
          return null;
        }

        const location = response.headers.get('location');
        if (location === null) {
          return null;
        }

        const nextUrl = new URL(location, currentUrl).href;
        const nextHostname = new URL(nextUrl).hostname;

        // Reject cross-origin redirects and SSRF targets
        if (nextHostname !== targetHostname || isBlockedHostname(nextHostname)) {
          return null;
        }

        currentUrl = nextUrl;
        continue;
      }

      break;
    }

    // Only store successful HTTP responses (2xx)
    if (response.status < 200 || response.status >= 300) {
      return null;
    }

    // Validate Content-Type against the expected resource type
    const contentType = response.headers.get('content-type');
    if (!isContentTypeCompatible(type, contentType)) {
      return null;
    }

    // Read body with size limit
    let body: string;
    let bodyBytes: number;
    try {
      const result = await readBodyWithLimit(response, this.maxResourceBytes);
      body = result.text;
      bodyBytes = result.bytes;
    } catch {
      return null; // too_large or other read error — skip resource
    }

    return {
      url: createUrl(currentUrl),
      type,
      size: bodyBytes,
      content: body,
      httpStatus: createHttpStatus(response.status),
      contentType: contentType ? mediaTypeOf(contentType) : null,
    };
  }
}
