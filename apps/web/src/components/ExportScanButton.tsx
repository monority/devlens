/**
 * ExportScanButton — a tiny client component that downloads the current
 * scan as a JSON file.
 *
 * Uses browser-native APIs only (Blob, URL.createObjectURL, <a download>).
 * No third-party libraries.
 *
 * The pure export mapping lives in `lib/export-scan.ts` and is tested
 * separately. This component only handles the download interaction.
 *
 * Accessibility:
 * - Real `<button>` element (keyboard accessible)
 * - `aria-label` for the button name
 * - `aria-live="polite"` for the "Exported!" feedback
 */

'use client';

import { useState } from 'react';
import { serializeExport, safeExportFilename, triggerDownload } from '../lib/export-scan';
import styles from './ScanCard.module.css';
import type { ScanDetailResponse } from '../lib/types.js';

export interface ExportScanButtonProps {
  /** The full scan detail result to export */
  result: ScanDetailResponse;
}

/**
 * Renders an "Export JSON" button that downloads the scan result as a
 * `devlens-<scan-id>.json` file.
 *
 * The exported JSON is generated from the existing API representation
 * via the pure `scanToExport()` function — no new domain model.
 */
export function ExportScanButton({ result }: ExportScanButtonProps): React.ReactElement {
  const [exported, setExported] = useState(false);

  const handleExport = () => {
    try {
      const json = serializeExport(result);
      const filename = safeExportFilename(result.scan.id);
      triggerDownload(json, filename);
      setExported(true);
      setTimeout(() => setExported(false), 3000);
    } catch {
      // Clipboard/download failure — the button simply doesn't show success feedback
      setExported(false);
    }
  };

  return (
    <div className={styles.exportScanLink}>
      <button
        type="button"
        onClick={handleExport}
        className={styles.exportButton}
        aria-label="Export scan as JSON"
      >
        Export JSON
      </button>
      {exported && (
        <span className={styles.exportFeedback} aria-live="polite">
          Exported!
        </span>
      )}
    </div>
  );
}
