/**
 * CopyReportLink — a tiny client component that copies the current
 * scan report URL to the clipboard.
 *
 * Uses the browser Clipboard API directly — no dependencies.
 *
 * Structure:
 *   CopyReportLink       (client component — manages click → clipboard)
 *   └── CopyFeedback     (pure — renders "Copied!" or error feedback)
 *
 * Accessiblity:
 *   - Real `<button>` element (keyboard accessible)
 *   - `aria-label` provides accessible name
 *   - Feedback wrapped in `aria-live="polite"` region
 *   - No color-only feedback (text content provided)
 */

'use client';

import { useState } from 'react';
import { copyToClipboard } from '../lib/clipboard';
import styles from './ScanCard.module.css';

export type CopyStatus = 'idle' | 'copied' | 'error';

/**
 * Pure presentation for the copy feedback message.
 * No hooks — testable with `renderToString`.
 */
export function CopyFeedback({ status }: { status: CopyStatus }): React.ReactElement {
  if (status === 'copied') {
    return (
      <span className={styles.copyFeedback} aria-live="polite">
        Copied!
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className={styles.copyError} aria-live="polite">
        Copy failed. Please copy the link manually.
      </span>
    );
  }
  return <></>;
}

export interface CopyReportLinkProps {
  /** The scan ID, used to construct the report path for fallback */
  scanId: string;
}

/**
 * Renders a "Copy report link" button that copies the current page URL
 * to the clipboard using the browser Clipboard API.
 *
 * The copied URL is the full current page URL (`window.location.href`).
 * If the clipboard API is unavailable, the user is shown an error message
 * with the report path for manual copying.
 */
export function CopyReportLink({ scanId }: CopyReportLinkProps): React.ReactElement {
  const [status, setStatus] = useState<CopyStatus>('idle');

  const reportPath = `/scans/${scanId}`;

  const handleCopy = async () => {
    setStatus('idle');
    const url = typeof window !== 'undefined' ? window.location.href : reportPath;
    const success = await copyToClipboard(url);
    if (success) {
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 3000);
    } else {
      setStatus('error');
    }
  };

  return (
    <div className={styles.copyReportLink}>
      <button type="button" onClick={handleCopy} aria-label="Copy report link">
        Copy report link
      </button>
      <CopyFeedback status={status} />
    </div>
  );
}
