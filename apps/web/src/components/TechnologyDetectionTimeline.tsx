/**
 * TechnologyDetectionTimeline — pure presentation component rendering a
 * technology's per-scan detection history as a table (Step 88 §6/§13).
 *
 * Pure: receives pre-computed `TechnologyDetectionHistoryEntry[]` (produced by
 * `technology-detection-history.ts`, which itself reuses the scan-detail
 * pipeline) and renders HTML. No data fetching, no React state.
 *
 * Columns (Step 88 §6): Scan date, Confidence, Version, Evidence,
 * Signal quality, Provenance, Integrity, Status. Each scan-date cell links to
 * `/scans/{scanId}` so a user can drill into the identical detection shown on
 * the scan-detail page.
 *
 * Renders `null` when there are no entries — the surrounding page owns the
 * empty/fact-text state, so an empty timeline adds nothing to the DOM
 * (Step 88 §17 "no-detection → absent").
 *
 * Presentation is normalized here (never recomputed):
 *   - §9  integrity: `null` ⇒ "Valid"; present ⇒ "Invalid" + existing labels
 *        (via the shared `integrityIssueLabel` presenter).
 *   - §76 signal quality: rendered with the same compact label the detail view
 *        uses (`Single signal · 1 source`, etc.), inlined to avoid constructing
 *        a throwaway `DetectionResponse`.
 *   - evidence type labels reuse `evidenceTypeLabel`; version/conflict values
 *        are read verbatim from the entry.
 */

import Link from 'next/link';
import { integrityIssueLabel } from '@/lib/detection-integrity-presenter';
import { evidenceTypeLabel } from '@/lib/evidence-presenter';
import type { SignalQualityLevel } from '@/lib/types.js';
import type { TechnologyDetectionHistoryEntry } from '@/lib/technology-detection-history.js';
import styles from './TechnologyDetectionTimeline.module.css';

// ─── Pure presentation helpers ───────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Compact, locale-free UTC timestamp formatter (`Sep 16, 2025 at 14:30 UTC`).
 * Deterministic — no `Intl` so output is stable across timezones/localed runtimes.
 */
function formatDate(iso: string | null): string {
  if (iso === null) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} at ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/**
 * Compact signal-quality line, mirroring `signalQualityLabel` in
 * `lib/signal-quality.ts` (Step 76 §10) without constructing a full
 * `DetectionResponse` — the entry already carries `source` + `signalQuality`.
 */
function signalQualityText(
  sq: TechnologyDetectionHistoryEntry['signalQuality'],
  source: 'direct' | 'relationship',
): string {
  if (sq.level === 'no_evidence') {
    return source === 'relationship' ? 'Derived · no direct evidence' : 'No evidence';
  }
  const levelLabel: Record<Exclude<SignalQualityLevel, 'no_evidence'>, string> = {
    single_signal: 'Single signal',
    corroborated: 'Multi-source',
    strong: 'Strong',
  };
  const noun = `${sq.sourceCount} source${sq.sourceCount === 1 ? '' : 's'}`;
  return `${levelLabel[sq.level]} · ${noun}`;
}

// ─── Component ───────────────────────────────────────────────────────

export interface TechnologyDetectionTimelineProps {
  /** Newest-first detection history for one technology (may be `[]`). */
  readonly entries: ReadonlyArray<TechnologyDetectionHistoryEntry>;
}

/** Returns `null` (renders nothing) when there are no entries (Step 88 §17). */
export function TechnologyDetectionTimeline({
  entries,
}: TechnologyDetectionTimelineProps): React.ReactElement | null {
  if (entries.length === 0) {
    return null;
  }

  return (
    <section className={styles.timeline} aria-label="Detection history">
      <h2 className={styles.heading}>Detection history</h2>
      <table className={styles.table}>
        <caption>Detection history for this technology across completed scans</caption>
        <thead>
          <tr>
            <th className={`${styles.th} ${styles.colDate}`}>Scan</th>
            <th className={`${styles.th} ${styles.colConfidence}`}>Confidence</th>
            <th className={`${styles.th} ${styles.colVersion}`}>Version</th>
            <th className={`${styles.th} ${styles.colEvidence}`}>Evidence</th>
            <th className={`${styles.th} ${styles.colSignal}`}>Signal quality</th>
            <th className={`${styles.th} ${styles.colProvenance}`}>Provenance</th>
            <th className={`${styles.th} ${styles.colIntegrity}`}>Integrity</th>
            <th className={`${styles.th} ${styles.colStatus}`}>Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.scanId}>
              <td className={`${styles.td} ${styles.colDate}`}>
                <time dateTime={entry.scanCreatedAt} className={styles.scanDate}>
                  <Link href={`/scans/${entry.scanId}`}>{formatDate(entry.scanCreatedAt)}</Link>
                </time>
                {entry.scanCompletedAt && (
                  <time dateTime={entry.scanCompletedAt} className={styles.terminalTime}>
                    {formatDate(entry.scanCompletedAt)}
                  </time>
                )}
                {/* Step 91 §6: the scan target hostname (site) so each historical
                    observation is self-identifying. Rendered as plain text (not a
                    link) to avoid a duplicate navigation element — the scan date
                    above already links to /scans/{scanId} (§8). */}
                <span className={styles.scanHostname}>{entry.scanHostname}</span>
              </td>

              <td className={`${styles.td} ${styles.colConfidence}`}>
                <span className={styles.confidence}>{entry.confidence}</span>
              </td>

              <td className={`${styles.td} ${styles.colVersion}`}>
                {entry.versionConflict ? (
                  <span className={styles.versionConflict}>Conflict</span>
                ) : entry.version ? (
                  <span className={styles.version}>{entry.version}</span>
                ) : (
                  <span className={styles.versionAbsent}>—</span>
                )}
                {entry.versionSource && (
                  <span className={styles.versionSource}>{entry.versionSource}</span>
                )}
              </td>

              <td className={`${styles.td} ${styles.colEvidence}`}>
                <span className={styles.evidenceCount}>{entry.evidenceCount}</span>
                {entry.provenance && entry.provenance.evidenceTypes.length > 0 && (
                  <span className={styles.evidenceTypes}>
                    ({entry.provenance.evidenceTypes.map(evidenceTypeLabel).join(', ')})
                  </span>
                )}
              </td>

              <td className={`${styles.td} ${styles.colSignal}`}>
                <span className={styles.signalQuality}>
                  {signalQualityText(entry.signalQuality, entry.source)}
                </span>
              </td>

              <td className={`${styles.td} ${styles.colProvenance}`}>
                <span className={styles.provenance}>
                  {entry.source === 'relationship' ? 'Derived' : 'Direct'}
                </span>
                {entry.source === 'relationship' &&
                  entry.derivedFrom &&
                  entry.derivedFrom.length > 0 && (
                    <span className={styles.derivedSources}>
                      from {entry.derivedFrom.map((d) => d.sourceName ?? d.source).join(', ')}
                    </span>
                  )}
              </td>

              <td className={`${styles.td} ${styles.colIntegrity}`}>
                {entry.integrity === null ? (
                  <span className={styles.integrityValid}>Valid</span>
                ) : (
                  <span className={styles.integrityInvalid}>Invalid</span>
                )}
                {entry.integrity && entry.integrity.issues.length > 0 && (
                  <span className={styles.integrityIssues}>
                    ({entry.integrity.issues.map(integrityIssueLabel).join(', ')})
                  </span>
                )}
              </td>

              <td className={`${styles.td} ${styles.colStatus}`}>
                {/* History only ever contains completed scans (see the
                    transformer's filter), so the badge is always "Completed". */}
                <span className={styles.statusBadge}>Completed</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
