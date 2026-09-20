/**
 * SiteSnapshot — an immutable observation of a website at a particular
 * moment.
 *
 * The snapshot captures the HTTP response, the HTML document metadata,
 * and the resources (scripts, stylesheets, etc.) discovered on the page.
 * It is produced by the crawler (a later step) and consumed by the
 * detectors and analyzer (also later steps).
 *
 * This module contains no crawler behavior, no browser APIs, and no
 * Node.js types — only pure domain structures.
 */

import type { Url, Hostname, Timestamp, HttpStatus } from './value-objects.js';

/**
 * A single HTTP header name/value pair.
 */
export interface HttpHeader {
  readonly name: string;
  readonly value: string;
}

/**
 * Domain-relevant HTTP response information.
 *
 * Uses its own types (not `Response`, `Headers`, or `Request` from
 * Node.js or the browser Fetch API).
 */
export interface HttpObservation {
  readonly statusCode: HttpStatus;
  readonly headers: ReadonlyArray<HttpHeader>;
  readonly contentType: string;
  readonly finalUrl: Url;
}

/**
 * A meta tag extracted from the HTML document.
 *
 * Each entry represents a `<meta name="..." content="...">` tag found
 * in the snapshot's HTML. Both `name` and `content` preserve the
 * original casing as received from the page.
 */
export interface MetaTag {
  readonly name: string;
  readonly content: string;
}

/**
 * A `<script>` tag extracted from the HTML document.
 *
 * `src` is the value of the `src` attribute (the external URL of the
 * script), or `null` for inline scripts that have no `src` attribute.
 * `content` is the text content between the opening and closing tags
 * (empty string for `src`-only scripts).
 */
export interface ScriptTag {
  readonly src: string | null;
  readonly content: string;
}

/**
 * A `<link>` tag extracted from the HTML document.
 *
 * `rel` is the value of the `rel` attribute (space-separated list),
 * or `null` when absent. `href` is the `href` attribute value, or
 * `null` when absent. `content` is the full raw tag text (e.g.
 * `<link rel="stylesheet" href="/app.css" media="all">`), preserved for
 * context and debugging.
 *
 * Ordering follows document order. Tags without an `href` attribute
 * are included (with `href: null`) so that `rel`-based analysis is
 * possible, but detectors that require a URL will skip them.
 */
export interface LinkTag {
  readonly rel: string | null;
  readonly href: string | null;
  readonly content: string;
}

/**
 * Extractable metadata from the HTML document.
 *
 * `description` is `null` when no meta description is present — the field
 * is required (not optional) so that consumers always know whether a
 * description was looked for.
 *
 * `metaTags` is a list of all `<meta name="..." content="...">` tags
 * found in the document. This is the raw data for {@link MetaTagDetector}.
 *
 * `scripts` is a list of all `<script>` tags found in the document.
 * This is the raw data for {@link ScriptUrlDetector}.
 */
export interface HtmlObservation {
  readonly title: string;
  readonly description: string | null;
  readonly metaTags: ReadonlyArray<MetaTag>;
  readonly scripts: ReadonlyArray<ScriptTag>;
  readonly links: ReadonlyArray<LinkTag>;
}

/**
 * The type of a resource loaded or referenced by the page.
 *
 * Values `css`, `robots`, and `manifest` are introduced in Step 6H for
 * controlled resource observation (robots.txt, manifest.json, and
 * same-origin CSS). The remaining values cover resources discovered from
 * HTML markup but not yet fetched.
 */
export type ResourceType =
  | 'script'
  | 'stylesheet'
  | 'css'
  | 'image'
  | 'font'
  | 'video'
  | 'audio'
  | 'document'
  | 'robots'
  | 'manifest'
  | 'favicon'
  | 'other';

/**
 * The lifecycle stage of a {@link Resource} within the
 * discover → select → acquire pipeline (Step 70).
 *
 * - `discovered` — referenced by the HTML document but not yet selected
 *   for acquisition (e.g. beyond budget, or external-and-restricted).
 * - `selected` — chosen for acquisition but not yet fetched (rarely
 *   observed directly; resources move to `fetched`/`failed`/`skipped`
 *   once acquisition is attempted).
 * - `fetched` — successfully acquired within policy limits.
 * - `failed` — acquisition was attempted but failed (network/timeout/
 *   non-2xx/oversized/body error).
 * - `skipped` — never acquired (blocked by SSRF/same-origin, duplicate,
 *   or excluded by the selection policy).
 */
export type ResourceAcquisitionStatus =
  'discovered' | 'selected' | 'fetched' | 'failed' | 'skipped';

/**
 * A resource observed during a crawl.
 *
 * `size` is `null` when the resource size is unknown (e.g. discovered
 * from markup but not yet fetched).
 *
 * `content` holds the observed body text of the resource (empty string
 * when the resource was not fetched or had an empty body).
 *
 * `httpStatus` is the HTTP status code observed when the resource was
 * fetched (or `200` when the resource was only discovered from markup).
 *
 * `contentType` is the response `Content-Type` header value (without
 * parameters), or `null` when the resource was not fetched.
 *
 * Step 70 extends `Resource` with optional provenance fields. These are
 * optional so that existing `Resource` literals (and persisted rows) remain
 * valid:
 *
 * - `sourcePage` — the page URL that referenced this resource
 *   (distinguishes a primary-document signal from a secondary-resource
 *   signal, e.g. `https://example.com/` vs
 *   `https://example.com/assets/app.js`).
 * - `acquisitionStatus` — lifecycle stage from the discover→select→acquire
 *   pipeline.
 * - `failureReason` — present when `acquisitionStatus` is `failed` or
 *   `skipped`; never fabricated.
 * - `responseHeaders` — relevant response headers of the fetched resource
 *   (omitted for discovered/failed resources).
 */
export interface Resource {
  readonly url: Url;
  readonly type: ResourceType;
  readonly size: number | null;
  readonly content: string;
  readonly httpStatus: HttpStatus;
  readonly contentType: string | null;
  readonly sourcePage?: Url;
  readonly acquisitionStatus?: ResourceAcquisitionStatus;
  readonly failureReason?: string;
  readonly responseHeaders?: ReadonlyArray<HttpHeader>;
}

/**
 * An immutable observation of a website at a moment in time.
 */
export interface SiteSnapshot {
  readonly url: Url;
  readonly hostname: Hostname;
  readonly capturedAt: Timestamp;
  readonly http: HttpObservation;
  readonly html: HtmlObservation;
  readonly resources: ReadonlyArray<Resource>;
}
