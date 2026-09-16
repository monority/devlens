/**
 * ScanComparison — presentation component for the scan comparison report.
 *
 * Pure presentation component. Receives a `ComparisonResult` (produced by
 * the pure `compareScans()` function) and renders a structured, textual
 * comparison report.
 *
 * Does NOT call any API, access the database, or perform detection logic.
 * All comparison logic lives in `lib/comparison.ts`.
 */

import type { ComparisonResult, TechnologyComparison, EvidenceComparison } from '../lib/comparison';
import {
  evidenceTypeLabel,
  evidenceFields,
  evidenceIsUrl,
  evidenceUrl,
} from '../lib/evidence-presenter';
import type { EvidenceResponse } from '../lib/types.js';
import { ScanSummary } from './ScanSummary';
import styles from './ScanCard.module.css';

export interface ScanComparisonProps {
  result: ComparisonResult;
}

// ─── Main component ──────────────────────────────────────────────────

export function ScanComparison({ result }: ScanComparisonProps): React.ReactElement {
  // If either scan is missing, show error/missing state.
  if (result.leftNotFound || result.rightNotFound) {
    return (
      <article className={styles.comparison}>
        <ComparisonError result={result} />
      </article>
    );
  }

  // If both scans resolved, show the full comparison.
  return (
    <article className={styles.comparison}>
      {/* ── Scan headers (target, timestamps, status) ── */}
      <ComparisonHeader result={result} />

      {/* ── Target difference notice ── */}
      {result.targetsDiffer && (
        <section className={styles.targetWarning}>
          <h2>⚠ Different targets</h2>
          <p>
            The two scans target different sites. Comparisons are provided for informational
            purposes only.
          </p>
          <ul className={styles.targetList}>
            <li>
              <strong>Previous:</strong> {result.left!.scan.target}
            </li>
            <li>
              <strong>Current:</strong> {result.right!.scan.target}
            </li>
          </ul>
        </section>
      )}

      {/* ── Failed scan notice ── */}
      {(result.leftFailed || result.rightFailed) && (
        <section className={styles.failedNotice}>
          <h2>Limited comparison</h2>
          {result.leftFailed && (
            <p>
              The previous scan (<code>{result.left!.scan.id}</code>) has a<strong> failed</strong>{' '}
              status. Detection comparison is unavailable for failed scans.
            </p>
          )}
          {result.rightFailed && (
            <p>
              The current scan (<code>{result.right!.scan.id}</code>) has a<strong> failed</strong>{' '}
              status. Detection comparison is unavailable for failed scans.
            </p>
          )}
        </section>
      )}

      {/* ── Technology changes ── */}
      {!result.leftFailed && !result.rightFailed && <TechnologyChanges result={result} />}
    </article>
  );
}

// ─── Comparison header ───────────────────────────────────────────────

function ComparisonHeader({ result }: { result: ComparisonResult }): React.ReactElement {
  return (
    <header className={styles.comparisonHeader}>
      <h1>Scan Comparison</h1>
      <div className={styles.comparisonSides}>
        <div className={styles.comparisonSide}>
          <h2>Previous / Left</h2>
          <ScanSummary scan={result.left!.scan} />
        </div>
        <div className={styles.comparisonSide}>
          <h2>Current / Right</h2>
          <ScanSummary scan={result.right!.scan} />
        </div>
      </div>
    </header>
  );
}

// ─── Comparison error (missing scan) ─────────────────────────────────

function ComparisonError({ result }: { result: ComparisonResult }): React.ReactElement {
  const missingIds: string[] = [];
  if (result.leftNotFound) missingIds.push('left');
  if (result.rightNotFound) missingIds.push('right');

  return (
    <div className={styles.comparisonError}>
      <h2>Unable to compare scans</h2>
      <p>
        One or both of the requested scans could not be found:{' '}
        {missingIds.map((id) => `${id} scan`).join(' and ')}
      </p>
      <p>
        <a href="/scans" className={styles.comparisonErrorLink}>
          ← Back to scan history
        </a>
      </p>
    </div>
  );
}

// ─── Technology changes ──────────────────────────────────────────────

function TechnologyChanges({ result }: { result: ComparisonResult }): React.ReactElement {
  if (!result.hasChanges) {
    return (
      <section className={styles.noChanges}>
        <h2>Technology changes</h2>
        <p>No detection changes</p>
      </section>
    );
  }

  return (
    <section className={styles.techChanges}>
      <h2>Technology changes</h2>

      {result.added.length > 0 && (
        <>
          <h3>Added ({result.added.length})</h3>
          <ul className={styles.changeList}>
            {result.added.map((d) => (
              <TechnologyComparisonItem key={d.id} detection={d} />
            ))}
          </ul>
        </>
      )}

      {result.removed.length > 0 && (
        <>
          <h3>Removed ({result.removed.length})</h3>
          <ul className={styles.changeList}>
            {result.removed.map((d) => (
              <TechnologyComparisonItem key={d.id} detection={d} />
            ))}
          </ul>
        </>
      )}

      {result.unchanged.length > 0 && (
        <>
          <h3>Present in both ({result.unchanged.length})</h3>
          <ul className={styles.changeList}>
            {result.unchanged.map((d) => (
              <TechnologyComparisonItem key={d.id} detection={d} />
            ))}
          </ul>
        </>
      )}

      {/* Score/confidence changes */}
      {result.scoreChanges.length > 0 && (
        <>
          <h3>Score / confidence changes ({result.scoreChanges.length})</h3>
          <table className={styles.scoreTable}>
            <thead>
              <tr>
                <th>Technology</th>
                <th>Previous</th>
                <th>Current</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {result.scoreChanges.map((d) => (
                <ScoreChangeRow key={d.id} detection={d} />
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Evidence changes */}
      {result.evidenceChanges.some((e) => e.status !== 'unchanged') && (
        <>
          <h3>Evidence changes</h3>
          <EvidenceChangeList changes={result.evidenceChanges} />
        </>
      )}
    </section>
  );
}

// ─── Technology comparison item ───────────────────────────────────────

function TechnologyComparisonItem({
  detection,
}: {
  detection: TechnologyComparison;
}): React.ReactElement {
  const badgeClass =
    detection.status === 'added'
      ? styles.addedBadge
      : detection.status === 'removed'
        ? styles.removedBadge
        : styles.unchangedBadge;

  return (
    <li className={styles.changeItem}>
      <span className={`${styles.changeBadge} ${badgeClass}`}>{detection.status}</span>
      <span className={styles.techName}>{detection.name}</span>
      <span className={styles.category}>{detection.category}</span>
      {detection.scoreChanged && (
        <span className={styles.scoreChange}>
          {detection.leftConfidence} → {detection.rightConfidence}
          {(detection.scoreDelta ?? 0) > 0 ? ' ↑' : ' ↓'}
        </span>
      )}
      {detection.evidenceChanges.some((e) => e.status !== 'unchanged') && (
        <EvidenceChangeList changes={detection.evidenceChanges} />
      )}
    </li>
  );
}

// ─── Score change row ────────────────────────────────────────────────

function ScoreChangeRow({ detection }: { detection: TechnologyComparison }): React.ReactElement {
  const delta = detection.scoreDelta ?? 0;
  const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;

  return (
    <tr>
      <td>{detection.name}</td>
      <td>{detection.leftConfidence ?? '—'}</td>
      <td>{detection.rightConfidence ?? '—'}</td>
      <td>{deltaStr}</td>
    </tr>
  );
}

// ─── Evidence change list ────────────────────────────────────────────

function EvidenceChangeList({ changes }: { changes: EvidenceComparison[] }): React.ReactElement {
  const visibleChanges = changes.filter((e) => e.status !== 'unchanged');

  if (visibleChanges.length === 0) {
    return <p className={styles.noEvidenceChanges}>No evidence changes</p>;
  }

  return (
    <table className={styles.evidenceTable}>
      <thead>
        <tr>
          <th>Status</th>
          <th>Type</th>
          <th>Evidence</th>
        </tr>
      </thead>
      <tbody>
        {visibleChanges.map((change) => (
          <EvidenceChangeRow key={change.key} change={change} />
        ))}
      </tbody>
    </table>
  );
}

// ─── Evidence change row ─────────────────────────────────────────────

function EvidenceChangeRow({ change }: { change: EvidenceComparison }): React.ReactElement {
  const item: EvidenceResponse | null = change.right ?? change.left;
  const label = item !== null ? evidenceTypeLabel(item.type) : 'Unknown';
  const fields = item !== null ? evidenceFields(item) : [];
  const isUrl = item !== null && evidenceIsUrl(item);
  const url = isUrl ? evidenceUrl(item) : null;

  return (
    <tr>
      <td>
        <span
          className={
            change.status === 'added'
              ? styles.addedBadge
              : change.status === 'removed'
                ? styles.removedBadge
                : styles.unchangedBadge
          }
        >
          {change.status}
        </span>
      </td>
      <td>{label}</td>
      <td>
        {isUrl && url !== null ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={styles.evidenceUrl}>
            {url}
          </a>
        ) : (
          fields.map((f) => (
            <span key={f.label}>
              {f.label}:{' '}
              {f.label === 'Snippet' || f.label === 'Selector' ? <code>{f.value}</code> : f.value}
            </span>
          ))
        )}
      </td>
    </tr>
  );
}
