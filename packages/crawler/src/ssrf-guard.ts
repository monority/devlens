/**
 * Basic SSRF (Server-Side Request Forgery) protection.
 *
 * This module provides a minimal hostname/IP blocklist that prevents the
 * crawler from making requests to internal addresses that could expose
 * sensitive services:
 *
 * - Localhost and loopback addresses (127.0.0.0/8)
 * - Private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * - Unspecified address (0.0.0.0)
 * - Link-local addresses (169.254.0.0/16)
 * - IPv6 loopback, unique-local, and link-local
 *
 * **Known limitations:**
 *
 * This is a hostname-and-IP-level check only. It does NOT protect against:
 *
 * - **DNS rebinding**: An attacker can return a public IP on the first DNS
 *   resolution and a private IP on the second, after the check passes.
 *   Full protection requires DNS-level validation at the socket layer.
 * - **DNS-based metadata services**: Cloud metadata endpoints (e.g.
 *   `169.254.169.254`) are blocked by IP, but domain-based metadata
 *   endpoints are not.
 * - **IPv6 non-Private ranges**: Only well-known IPv6 private ranges are
 *   blocked. Other link-local or reserved IPv6 addresses may not be caught.
 *
 * For a production deployment, SSRF protection should be enforced at the
 * application boundary (network policy or dedicated proxy), not solely
 * at the crawler level.
 */

/**
 * Returns `true` if the given hostname should be blocked due to SSRF risk.
 *
 * This checks both hostnames (e.g. `localhost`) and IP addresses (IPv4
 * and IPv6) against known private/internal ranges.
 */
export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // ── Hostname checks ───────────────────────────────────────────────

  // localhost and localhost.localdomain
  if (lower === 'localhost' || lower.endsWith('.localhost')) {
    return true;
  }

  // Localhost TLD (localhost.localdomain, etc.)
  if (lower.endsWith('.localhost.localdomain')) {
    return true;
  }

  // ── IPv4 checks ───────────────────────────────────────────────────

  const ipv4 = parseIPv4(lower);
  if (ipv4 !== null) {
    return isPrivateIPv4(ipv4);
  }

  // ── IPv6 checks ───────────────────────────────────────────────────

  if (isIPv6Loopback(lower) || isIPv6LinkLocal(lower) || isIPv6UniqueLocal(lower)) {
    return true;
  }

  return false;
}

/**
 * Parses a string as an IPv4 address. Returns the octets as a 4-element
 * array, or `null` if the string is not a valid IPv4 address.
 */
function parseIPv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const octets: number[] = [];
  for (const part of parts) {
    // Empty part or part with leading zeros (e.g. "01") — reject
    if (part === '' || (part.length > 1 && part.startsWith('0'))) {
      return null;
    }

    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) {
      return null;
    }
    octets.push(num);
  }

  return octets.length === 4 ? octets : null;
}

/**
 * Checks if an IPv4 address (as octets) is in a private/internal range.
 */
function isPrivateIPv4(octets: number[]): boolean {
  const [a, b] = octets;

  // Guard against undefined (noUncheckedIndexedAccess)
  if (a === undefined || b === undefined) {
    return false;
  }

  // 127.0.0.0/8 — IPv4 loopback
  if (a === 127) return true;

  // 10.0.0.0/8 — private
  if (a === 10) return true;

  // 172.16.0.0/12 — private
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 — private
  if (a === 192 && b === 168) return true;

  // 0.0.0.0/8 — unspecified
  if (a === 0) return true;

  // 169.254.0.0/16 — link-local
  if (a === 169 && b === 254) return true;

  return false;
}

/**
 * Checks if a string matches the IPv6 loopback address `::1`.
 */
function isIPv6Loopback(hostname: string): boolean {
  return hostname === '::1' || hostname === '[::1]';
}

/**
 * Checks if a string is an IPv6 link-local address (fe80::/10).
 */
function isIPv6LinkLocal(hostname: string): boolean {
  if (!hostname.startsWith('[') || !hostname.endsWith(']')) {
    return false;
  }
  const ip = hostname.slice(1, -1).split('%')[0] ?? ''; // strip brackets, drop zone ID
  return (
    ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')
  );
}

/**
 * Checks if a string is an IPv6 unique-local address (fc00::/7).
 */
function isIPv6UniqueLocal(hostname: string): boolean {
  if (!hostname.startsWith('[')) {
    // Check bare IPv6 notation (without brackets, may appear as hostname)
    const parts = hostname.split(':');
    if (parts.length >= 2) {
      const first = parts[0]?.toLowerCase();
      if (first === 'fc' || first === 'fd') {
        return true;
      }
    }
    return false;
  }
  return false;
}

/**
 * Checks if a URL is safe and allowed to be fetched as an observed resource.
 *
 * This combines three checks:
 *
 * 1. **Scheme validation** — only `http:` and `https:` URLs are allowed.
 *    Schemes such as `javascript:`, `data:`, `blob:`, `file:`, and `ftp:`
 *    are rejected, as are malformed URLs that cannot be parsed.
 * 2. **SSRF protection** — the hostname is checked against the same
 *    private/internal blocklist as {@link isBlockedHostname}.
 * 3. **Same-origin policy** — the URL's hostname must exactly match
 *    `targetHostname`. Cross-origin resource fetches are rejected.
 *
 * @param url            The URL to validate (may be relative).
 * @param targetHostname The hostname of the crawl target.
 * @returns `true` if the URL is safe to fetch.
 */
export function isResourceUrlAllowed(url: string, targetHostname: string): boolean {
  let parsed: URL;
  try {
    // A dummy base is needed for relative URLs. Relative URLs that
    // resolve to non-http schemes (e.g. `data:text/css,...`) will be
    // caught by the protocol check below.
    parsed = new URL(url, 'http://placeholder.example');
  } catch {
    return false; // malformed URL
  }

  // 1. Only allow http: and https: schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  // 2. SSRF protection
  if (isBlockedHostname(parsed.hostname)) {
    return false;
  }

  // 3. Same-origin: hostname must match the crawl target exactly
  if (parsed.hostname !== targetHostname) {
    return false;
  }

  return true;
}

/**
 * Checks if a URL is safe to fetch as an observed resource, generalizing
 * {@link isResourceUrlAllowed} to optionally permit cross-origin fetches.
 *
 * The SSRF protection (scheme validation + private/internal blocklist via
 * {@link isBlockedHostname}) is ALWAYS enforced — `allowExternal` does NOT
 * relax the SSRF boundary; it only controls whether a different (public)
 * origin is permitted.
 *
 * @param url             The URL to validate (may be relative).
 * @param targetHostname  The hostname of the crawl target (primary document).
 * @param allowExternal   When `false` (default) the URL must be same-origin
 *                        with `targetHostname` — identical to
 *                        {@link isResourceUrlAllowed}. When `true`, public
 *                        cross-origin URLs are permitted.
 */
export function isResourceFetchable(
  url: string,
  targetHostname: string,
  allowExternal: boolean = false,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url, 'http://placeholder.example');
  } catch {
    return false; // malformed URL
  }

  // 1. Only allow http: and https: schemes (blocks data:, javascript:, …).
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  // 2. SSRF protection (always enforced — private/loopback/link-local/…).
  if (isBlockedHostname(parsed.hostname)) {
    return false;
  }

  // 3. Same-origin policy: cross-origin allowed only when explicitly enabled.
  if (!allowExternal && parsed.hostname !== targetHostname) {
    return false;
  }

  return true;
}
