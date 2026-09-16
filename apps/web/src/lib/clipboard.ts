/**
 * Pure clipboard helper using the browser Clipboard API.
 *
 * Returns `true` on success, `false` on failure — no exceptions thrown.
 * This keeps the caller (a React component) simple and testable.
 */

/**
 * Copies text to the clipboard.
 *
 * @returns `true` if the text was copied successfully, `false` otherwise.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
