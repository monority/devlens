/**
 * Client-side URL validation for the scan creation form.
 *
 * This provides immediate feedback for obviously invalid input (empty,
 * not a URL, wrong protocol). The server remains authoritative — these
 * checks do not replicate complex domain validation rules; they only
 * short-circuit the obvious cases.
 *
 * @returns `null` if the URL is valid, or a user-facing error message string.
 */

/**
 * Validates that a URL string is non-empty and uses an http/https protocol.
 *
 * This mirrors the server-side checks in `handleCreateScan` for the common
 * cases, but does NOT replicate the full URL/domain validation logic — the
 * server remains authoritative.
 *
 * @param url The raw URL string entered by the user.
 * @returns `null` if valid, or a human-readable error message.
 */
export function validateUrl(url: string): string | null {
  if (url.trim() === '') {
    return 'Please enter a URL.';
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Please enter a valid URL (e.g. https://example.com).';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'URL must use the http or https protocol.';
  }

  return null;
}
