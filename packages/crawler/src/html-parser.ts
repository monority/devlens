/**
 * Minimal HTML metadata extraction.
 *
 * Extracts `<title>`, `<meta name="description">`, all
 * `<meta name="..." content="...">` tags, all `<script>` tags,
 * `<link rel="stylesheet" href="...">` links, and
 * `<link rel="manifest" href="...">` links from an HTML string. This is
 * NOT a full HTML parser — it uses carefully scoped regex patterns that
 * handle common HTML variations:
 *
 * - Tag/attribute names in any case (``<TITLE>``, ``<Meta Name=...>``)
 * - Attribute order variation (``name`` before or after ``content``)
 * - Double, single, or unquoted attribute values
 * - Whitespace variation around ``=``
 * - Incomplete / malformed HTML
 *
 * The extracted fields match the domain's {@link HtmlObservation} shape.
 */

/**
 * Extracted HTML metadata from a page.
 *
 * `description` is `null` when no `<meta name="description">` is present —
 * matching the domain's `HtmlObservation.description` semantics.
 *
 * `metaTags` is a list of all `<meta name="..." content="...">` tags
 * found in the document. Meta tags without a `name` attribute or without
 * a `content` attribute are skipped — only well-formed name/content
 * pairs are captured.
 *
 * `scripts` is a list of all `<script>` tags found in the document.
 * Each entry has a `src` (the `src` attribute value, or `null` for
 * inline scripts) and `content` (the text between the tags, or `''`
 * for `src`-only scripts).
 *
 * `stylesheetLinks` is a list of `href` values from all
 * `<link rel="stylesheet" href="...">` tags found in the document.
 * Relative URLs are returned as-is (resolution happens in the crawler).
 * Ordering follows document order. Duplicate hrefs are preserved.
 *
 * `manifestLink` is the `href` value of the first
 * `<link rel="manifest" href="...">` tag, or `null` if none is found.
 */
export interface HtmlExtract {
  readonly title: string;
  readonly description: string | null;
  readonly metaTags: Array<{ name: string; content: string }>;
  readonly scripts: Array<{ src: string | null; content: string }>;
  readonly stylesheetLinks: string[];
  readonly manifestLink: string | null;
  readonly linkTags: Array<{ rel: string | null; href: string | null; content: string }>;
}

/**
 * Extracts the `<title>` content from an HTML string.
 *
 * Handles: case-insensitive tags, tag attributes, newlines, extra whitespace.
 * Returns `''` if no title is found.
 */
function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) {
    return '';
  }
  const raw = match[1] ?? '';
  return raw.trim();
}

/**
 * Extracts the `content` value of an HTML attribute from an attribute-string.
 *
 * Supports double-quoted, single-quoted, and unquoted attribute values.
 * The attribute name is matched case-insensitively.
 *
 * @param attrString  The raw attribute portion of a tag (e.g. ` name="description" content="..."`)
 * @param attrName    The attribute name to look up (e.g. `name`, `content`)
 * @returns The attribute value, or `null` if not found.
 */
function getAttribute(attrString: string, attrName: string): string | null {
  const pattern = new RegExp(
    `(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  );
  const match = pattern.exec(attrString);
  if (!match) {
    return null;
  }
  // Return from the first matching capture group (quoted double → quoted single → unquoted)
  return match[1] ?? match[2] ?? match[3] ?? null;
}

/**
 * Extracts the meta description from an HTML string.
 *
 * Looks for the first `<meta>` tag whose `name` attribute (case-insensitive)
 * equals `description` (case-insensitive). Returns the `content` attribute
 * value, or `null` if no such tag is found.
 */
function extractDescription(html: string): string | null {
  const metaRegex = /<meta\b([^>]*)/gi;
  let match: RegExpExecArray | null;

  while ((match = metaRegex.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const name = getAttribute(attrs, 'name');
    if (name !== null && name.toLowerCase() === 'description') {
      const content = getAttribute(attrs, 'content');
      if (content !== null) {
        return content;
      }
    }
  }

  return null;
}

/**
 * Extracts all `<meta name="..." content="...">` tags from an HTML string.
 *
 * Iterates over all `<meta>` tags and collects those that have both a
 * `name` attribute and a `content` attribute. Tags missing either
 * attribute are skipped. Duplicate name/content pairs are preserved —
 * ordering follows document order.
 *
 * The `name` and `content` values preserve their original casing as
 * found in the HTML source.
 */
function extractMetaTags(html: string): Array<{ name: string; content: string }> {
  const metaTags: Array<{ name: string; content: string }> = [];
  const metaRegex = /<meta\b([^>]*)/gi;
  let match: RegExpExecArray | null;

  while ((match = metaRegex.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const name = getAttribute(attrs, 'name');
    if (name === null) {
      continue;
    }
    const content = getAttribute(attrs, 'content');
    if (content === null) {
      continue;
    }
    metaTags.push({ name, content });
  }

  return metaTags;
}

/**
 * Extracts all `<script>` tags from an HTML string.
 *
 * Each script tag is returned as `{ src, content }` where:
 * - `src` is the `src` attribute value (case-insensitive attribute
 *   matching via {@link getAttribute}), or `null` if the tag has no
 *   `src` attribute (inline script).
 * - `content` is the text content between the opening and closing
 *   `<script>` tags (trimmed of leading/trailing whitespace), or `''`
 *   if the tag has no content.
 *
 * Ordering follows document order. Tags without a closing `</script>`
 * are handled: `src` is extracted from the opening tag and `content`
 * is `''`.
 */
function extractScripts(html: string): Array<{ src: string | null; content: string }> {
  const scripts: Array<{ src: string | null; content: string }> = [];
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const rawContent = match[2] ?? '';
    const src = getAttribute(attrs, 'src');
    scripts.push({ src, content: rawContent.trim() });
  }

  return scripts;
}

/**
 * Extracts all `href` values from `<link rel="stylesheet" href="...">` tags.
 *
 * Iterates over all `<link>` tags and collects those whose `rel` attribute
 * (case-insensitive, space-separated) includes `stylesheet` and that have a
 * non-empty `href` attribute. Ordering follows document order. Duplicate
 * hrefs are preserved (deduplication happens at the crawler level).
 */
function extractStylesheetLinks(html: string): string[] {
  const links: string[] = [];
  const linkRegex = /<link\b([^>]*)/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const rel = getAttribute(attrs, 'rel');
    if (rel === null) {
      continue;
    }
    const relValues = rel
      .toLowerCase()
      .split(/\s+/)
      .filter((v) => v.length > 0);
    if (!relValues.includes('stylesheet')) {
      continue;
    }
    const href = getAttribute(attrs, 'href');
    if (href === null || href.trim() === '') {
      continue;
    }
    links.push(href);
  }

  return links;
}

/**
 * Extracts the `href` value from the first `<link rel="manifest" href="...">`
 * tag, or `null` if no such tag is found.
 *
 * The `rel` attribute is matched case-insensitively and space-separated
 * (so `rel="manifest mask-icon"` also matches).
 */
function extractManifestLink(html: string): string | null {
  const linkRegex = /<link\b([^>]*)/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const rel = getAttribute(attrs, 'rel');
    if (rel === null) {
      continue;
    }
    const relValues = rel
      .toLowerCase()
      .split(/\s+/)
      .filter((v) => v.length > 0);
    if (!relValues.includes('manifest')) {
      continue;
    }
    const href = getAttribute(attrs, 'href');
    if (href === null || href.trim() === '') {
      continue;
    }
    return href;
  }

  return null;
}

/**
 * Extracts all `<link>` tags from an HTML string.
 *
 * Each link tag is returned as `{ rel, href, content }` where:
 * - `rel` is the `rel` attribute value (case-insensitive, matching the
 *   existing `getAttribute` convention), or `null` if absent.
 * - `href` is the `href` attribute value, or `null` if absent.
 * - `content` is the full raw tag text (the entire `<link ...>` match).
 *
 * Ordering follows document order. Tags without an `href` attribute are
 * included (with `href: null`) so that `rel`-based analysis is possible.
 */
function extractLinkTags(
  html: string,
): Array<{ rel: string | null; href: string | null; content: string }> {
  const links: Array<{ rel: string | null; href: string | null; content: string }> = [];
  const linkRegex = /<link\b([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const fullMatch = match[0] ?? '';
    const attrs = match[1] ?? '';
    const rel = getAttribute(attrs, 'rel');
    const href = getAttribute(attrs, 'href');
    links.push({ rel, href, content: fullMatch });
  }

  return links;
}

/**
 * Extracts the `<title>`, `<meta name="description">`, all
 * `<meta name="..." content="...">` tags, all `<script>` tags,
 * all `<link>` tags, stylesheet links, and manifest link from an HTML
 * string.
 *
 * This is a lightweight extraction — no DOM parsing, no JavaScript execution,
 * no full HTML parsing. It handles common HTML variations (case, attribute
 * order, quoting styles) but is not a full HTML parser.
 */
export function extractHtml(html: string): HtmlExtract {
  return {
    title: extractTitle(html),
    description: extractDescription(html),
    metaTags: extractMetaTags(html),
    scripts: extractScripts(html),
    stylesheetLinks: extractStylesheetLinks(html),
    manifestLink: extractManifestLink(html),
    linkTags: extractLinkTags(html),
  };
}
