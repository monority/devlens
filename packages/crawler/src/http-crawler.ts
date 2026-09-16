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
import { isBlockedHostname, isResourceUrlAllowed } from './ssrf-guard.js';
import { extractHtml, type HtmlExtract } from './html-parser.js';

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

  constructor(options?: HttpCrawlerOptions) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;
    this.maxBodyBytes = options?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    this.maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.fetchFn = options?.fetch ?? globalThis.fetch;
    this.maxCssResources = options?.maxCssResources ?? DEFAULT_MAX_CSS_RESOURCES;
    this.maxResourceBytes = options?.maxResourceBytes ?? DEFAULT_MAX_RESOURCE_BYTES;
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
      // resources that were successfully fetched are included.
      const resources =
        extract !== null
          ? await this.observeResources(finalUrl, finalHostname, extract, abortController.signal)
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
