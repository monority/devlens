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
import { getDetectionExplainability } from '../lib/detection-explainability';
import { isKnownTechnology } from '../lib/technology-catalog';
import type { DetectionResponse, EvidenceResponse } from '../lib/types.js';
import { ScanOverview } from './ScanOverview';
import { getScanOverview } from '../lib/scan-overview';
import { EvidenceList } from './EvidenceList';
import Link from 'next/link';
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

      {/* ── Comparison summary ── */}
      <ComparisonSummary result={result} />

      {/* ── Technology changes ── */}
      {!result.leftFailed && !result.rightFailed && <TechnologyChanges result={result} />}
    </article>
  );
}

// ─── Comparison header ───────────────────────────────────────────────

function ComparisonHeader({ result }: { result: ComparisonResult }): React.ReactElement {
  const leftOverview = getScanOverview(result.left!);
  const rightOverview = getScanOverview(result.right!);

  return (
    <header className={styles.comparisonHeader}>
      <Link href="/scans" className={styles.comparisonBackLink}>
        ← Back to scan history
      </Link>
      <h2>Scan Comparison</h2>
      <div className={styles.comparisonSides}>
        <div className={styles.comparisonSide}>
          <h3>Previous / Left</h3>
          <ScanOverview overview={leftOverview} />
        </div>
        <div className={styles.comparisonSide}>
          <h3>Current / Right</h3>
          <ScanOverview overview={rightOverview} />
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

// ─── Comparison summary ────────────────────────────────────────────────

/**
 * Compact summary of comparison counts, derived directly from the
 * `ComparisonResult` without recomputing any comparison semantics.
 *
 * Shows: Added, Removed, Score changes, Evidence changes, Overall.
 */
function ComparisonSummary({ result }: { result: ComparisonResult }): React.ReactElement {
  const evidenceChangeCount = result.evidenceChanges.filter((e) => e.status !== 'unchanged').length;

  return (
    <section className={styles.comparisonSummary}>
      <h2>Comparison summary</h2>
      <dl>
        <div>
          <dt>Added</dt>
          <dd>{result.added.length}</dd>
        </div>
        <div>
          <dt>Removed</dt>
          <dd>{result.removed.length}</dd>
        </div>
        <div>
          <dt>Score changes</dt>
          <dd>{result.scoreChanges.length}</dd>
        </div>
        <div>
          <dt>Evidence changes</dt>
          <dd>{evidenceChangeCount}</dd>
        </div>
        <div>
          <dt>Overall</dt>
          <dd>{result.hasChanges ? 'Changes' : 'No Changes'}</dd>
        </div>
      </dl>
    </section>
  );
}

// ─── Technology changes ──────────────────────────────────────────────

/**
 * Looks up the full `DetectionResponse` for a technology by its canonical
 * `technology.id` from the scan's detections array.
 *
 * Pure helper — no comparison semantics, no mutation.
 */
function findDetectionById(
  detections: DetectionResponse[],
  techId: string,
): DetectionResponse | null {
  return detections.find((d) => d.technology.id === techId) ?? null;
}

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
              <TechnologyComparisonItem
                key={d.id}
                detection={d}
                fullDetection={findDetectionById(result.right!.detections, d.id)}
              />
            ))}
          </ul>
        </>
      )}

      {result.removed.length > 0 && (
        <>
          <h3>Removed ({result.removed.length})</h3>
          <ul className={styles.changeList}>
            {result.removed.map((d) => (
              <TechnologyComparisonItem
                key={d.id}
                detection={d}
                fullDetection={findDetectionById(result.left!.detections, d.id)}
              />
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
  fullDetection,
}: {
  detection: TechnologyComparison;
  /** Full detection from the source scan, looked up by technology.id.
   *  Present for added/removed technologies; null when the detection
   *  is missing from the source scan or for unchanged techs (which
   *  keep their existing evidence-change rendering). */
  fullDetection?: DetectionResponse | null;
}): React.ReactElement {
  const badgeClass =
    detection.status === 'added'
      ? styles.addedBadge
      : detection.status === 'removed'
        ? styles.removedBadge
        : styles.unchangedBadge;

  // Technology name: link to catalog detail page if the tech is known.
  const techName =
    fullDetection && isKnownTechnology(detection.id) ? (
      <Link
        href={`/technologies/${encodeURIComponent(detection.id)}`}
        className={styles.techNameLink}
      >
        {detection.name}
      </Link>
    ) : (
      <span className={styles.techName}>{detection.name}</span>
    );

  // Derive a structured explanation (summary + deduplicated evidence)
  // from the full detection — reused from the existing explainability pipeline.
  const explainability = fullDetection ? getDetectionExplainability(fullDetection) : null;

  return (
    <li className={styles.changeItem}>
      <span className={`${styles.changeBadge} ${badgeClass}`}>{detection.status}</span>
      {techName}
      <span className={styles.category}>{detection.category}</span>

      {/* Confidence for added/removed technologies (from the source scan) */}
      {detection.status === 'added' && detection.rightConfidence !== null && (
        <span className={styles.score}>Confidence: {detection.rightConfidence}</span>
      )}
      {detection.status === 'removed' && detection.leftConfidence !== null && (
        <span className={styles.score}>Confidence: {detection.leftConfidence}</span>
      )}

      {/* Existing: score delta for unchanged technologies with changed confidence */}
      {detection.status === 'unchanged' && detection.scoreChanged && (
        <span className={styles.scoreChange}>
          {detection.leftConfidence} → {detection.rightConfidence}
          {(detection.scoreDelta ?? 0) > 0 ? ' ↑' : ' ↓'}
        </span>
      )}

      {/* NEW: Explainability summary + supporting evidence for added/removed */}
      {fullDetection && explainability && explainability.evidenceCount > 0 && (
        <div className={styles.changeEvidence}>
          <p className={styles.detectionExplanation}>{explainability.summary}</p>
          <EvidenceList evidence={explainability.evidence} />
        </div>
      )}

      {/* Existing: evidence changes for unchanged technologies */}
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
