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
import { signalQualityLabel } from '../lib/signal-quality';
import { isKnownTechnology } from '../lib/technology-catalog';
import { integrityIssueLabel } from '../lib/detection-integrity-presenter';
import type { DetectionResponse, EvidenceResponse } from '../lib/types.js';
import { ScanOverview } from './ScanOverview';
import { getScanOverview } from '../lib/scan-overview';
import { EvidenceList } from './EvidenceList';
import Link from 'next/link';
import styles from './ScanCard.module.css';

export interface ScanComparisonProps {
  readonly result: ComparisonResult;
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

function ComparisonHeader({ result }: { readonly result: ComparisonResult }): React.ReactElement {
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

function ComparisonError({ result }: { readonly result: ComparisonResult }): React.ReactElement {
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
 * Shows: Added, Removed, Version changes, Score changes, Evidence changes,
 * Integrity changes, Overall.
 */
function ComparisonSummary({ result }: { readonly result: ComparisonResult }): React.ReactElement {
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
          <dt>Version changes</dt>
          <dd>{result.versionChanges.length}</dd>
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
          <dt>Integrity changes</dt>
          <dd>{result.integrityChanges.length}</dd>
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
 * `technology.id` from a scan's detections array.
 *
 * Re-resolved at render time (not cached on the comparison) so the item
 * degrades safely when the source detection has been filtered/omitted
 * post-comparison.
 */
function findDetectionById(
  detections: ReadonlyArray<DetectionResponse>,
  techId: string,
): DetectionResponse | null {
  return detections.find((d) => d.technology.id === techId) ?? null;
}

function TechnologyChanges({ result }: { readonly result: ComparisonResult }): React.ReactElement {
  if (!result.hasChanges) {
    return (
      <section className={styles.noChanges}>
        <h2>Technology changes</h2>
        <p>No detection changes</p>
      </section>
    );
  }

  const provenanceChanges = result.changes.filter(
    (c) => c.provenanceChanged && c.kind === 'provenance_changed',
  );
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

      {/* Step 74 — version transitions (respects Step 72 conflict rules:
          no fabricated transition when either side is in conflict). */}
      {result.versionChanges.length > 0 && (
        <>
          <h3>Version changes ({result.versionChanges.length})</h3>
          <ul className={styles.changeList}>
            {result.versionChanges.map((d) => (
              <VersionChangeItem key={d.id} detection={d} />
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

      {/* Step 77 §11 — provenance changes: source/relationship changes
      that classifyChange routes away from the score/version buckets. */}
      {provenanceChanges.length > 0 && (
        <>
          <h3>Provenance changes ({provenanceChanges.length})</h3>
          <ul className={styles.changeList}>
            {provenanceChanges.map((d) => (
              <TechnologyComparisonItem key={d.id} detection={d} />
            ))}
          </ul>
        </>
      )}

      {/* Step 87 — integrity verdict changes: structural soundness shifts
          (e.g. a formerly clean detection now has duplicate evidence or a
          provenance mismatch). Reuses the Step 86 integrity-issue labels. */}
      {result.integrityChanges.length > 0 && (
        <>
          <h3>Integrity changes ({result.integrityChanges.length})</h3>
          <ul className={styles.changeList}>
            {result.integrityChanges.map((d) => (
              <IntegrityChangeItem key={d.id} detection={d} />
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

/** Badge CSS class for a technology's change status. */
function getBadgeClass(status: TechnologyComparison['status']): string | undefined {
  if (status === 'added') return styles.addedBadge;
  if (status === 'removed') return styles.removedBadge;
  return styles.unchangedBadge;
}

/** Renders the technology name as a catalog link or plain span. */
function getTechNameElement(
  detection: TechnologyComparison,
  fullDetection?: DetectionResponse | null,
): React.ReactNode {
  if (fullDetection && isKnownTechnology(detection.id)) {
    return (
      <Link
        href={`/technologies/${encodeURIComponent(detection.id)}`}
        className={styles.techNameLink}
      >
        {detection.name}
      </Link>
    );
  }
  return <span className={styles.techName}>{detection.name}</span>;
}

/** Renders the version display for a technology comparison.
 *  Conflict sides (Step 72) surface a notice — never a fabricated value. */
function getVersionElement(detection: TechnologyComparison): React.ReactNode {
  if (detection.version.beforeConflict || detection.version.afterConflict) {
    return <span className={styles.versionConflict}>Version: unavailable — conflict detected</span>;
  }
  if (typeof detection.version.after === 'string') {
    return <span className={styles.version}>Version: {detection.version.after}</span>;
  }
  if (typeof detection.version.before === 'string') {
    return <span className={styles.version}>Version: {detection.version.before}</span>;
  }
  return null;
}

/** Renders the confidence score for added/removed technologies. */
function getConfidenceElement(detection: TechnologyComparison): React.ReactNode {
  if (detection.status === 'added' && detection.rightConfidence !== null) {
    return <span className={styles.score}>Confidence: {detection.rightConfidence}</span>;
  }
  if (detection.status === 'removed' && detection.leftConfidence !== null) {
    return <span className={styles.score}>Confidence: {detection.leftConfidence}</span>;
  }
  return null;
}

/** Renders the score-delta for unchanged technologies with changed confidence. */
function getScoreDeltaElement(detection: TechnologyComparison): React.ReactNode {
  if (detection.status === 'unchanged' && detection.scoreChanged) {
    return (
      <span className={styles.scoreChange}>
        {detection.leftConfidence} → {detection.rightConfidence}
        {(detection.scoreDelta ?? 0) > 0 ? ' ↑' : ' ↓'}
      </span>
    );
  }
  return null;
}

/** Renders the provenance change for a technology between two scans (Step 77). */
function getProvenanceChangeElement(
  beforeProvenance: string,
  afterProvenance: string,
  detection: TechnologyComparison,
): React.ReactNode {
  if (
    detection.before &&
    detection.after &&
    detection.provenanceChanged &&
    beforeProvenance !== afterProvenance
  ) {
    return (
      <span className={styles.provenanceChange}>
        Provenance: {beforeProvenance} → {afterProvenance}
      </span>
    );
  }
  return null;
}

/** Renders the signal-quality change between before/after detections (Step 77). */
function getSignalQualityChangeElement(
  beforeSqLabel: string | null,
  afterSqLabel: string | null,
): React.ReactNode {
  if (beforeSqLabel && afterSqLabel && beforeSqLabel !== afterSqLabel) {
    return (
      <span className={styles.signalQualityChange}>
        Signal quality: {beforeSqLabel} → {afterSqLabel}
      </span>
    );
  }
  return null;
}

function TechnologyComparisonItem({
  detection,
  fullDetection,
}: {
  readonly detection: TechnologyComparison;
  /** Full detection from the source scan (re-resolved by id at render time).
   *  Present for added/removed technologies; undefined for unchanged. */
  readonly fullDetection?: DetectionResponse | null;
}): React.ReactElement {
  const badgeClass = getBadgeClass(detection.status);

  // Technology name: link to catalog detail page if the tech is known.
  const techName = getTechNameElement(detection, fullDetection);

  // Step 77 — provenance & signal-quality deltas are READ from the precomputed
  // before/after (Step 77 §7: reuse `explanation.signalQuality`, never recompute).
  const before = detection.before;
  const after = detection.after;
  const beforeProvenance = before?.source === 'relationship' ? 'Derived' : 'Direct';
  const afterProvenance = after?.source === 'relationship' ? 'Derived' : 'Direct';
  const beforeSq = before?.explanation?.signalQuality;
  const afterSq = after?.explanation?.signalQuality;
  const beforeSqLabel = before && beforeSq ? signalQualityLabel(before, beforeSq) : null;
  const afterSqLabel = after && afterSq ? signalQualityLabel(after, afterSq) : null;

  // Derive a structured explanation (summary + deduplicated evidence)
  // from the full detection — reused from the existing explainability pipeline.
  const explainability = fullDetection ? getDetectionExplainability(fullDetection) : null;

  return (
    <li className={styles.changeItem}>
      <span className={`${styles.changeBadge} ${badgeClass}`}>{detection.status}</span>
      {techName}
      <span className={styles.category}>{detection.category}</span>

      {getConfidenceElement(detection)}
      {getVersionElement(detection)}
      {getScoreDeltaElement(detection)}
      {getProvenanceChangeElement(beforeProvenance, afterProvenance, detection)}
      {getSignalQualityChangeElement(beforeSqLabel, afterSqLabel)}

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

// ─── Version change row (Step 74) ────────────────────────────────────

/** Renders a `version_changed` technology: "before → after".
 *  Conflict sides (Step 72) are surfaced honestly — never a fabricated
 *  transition — via the existing `versionConflict` notice. */
function VersionChangeItem({
  detection,
}: {
  readonly detection: TechnologyComparison;
}): React.ReactElement {
  const vc = detection.version;
  const from = typeof vc.before === 'string' ? vc.before : '—';
  const to = typeof vc.after === 'string' ? vc.after : '—';

  return (
    <li className={styles.changeItem}>
      <span className={styles.changeBadge}>version changed</span>
      {detection.name}
      <span className={styles.category}>{detection.category}</span>
      {vc.beforeConflict || vc.afterConflict ? (
        <span className={styles.versionConflict}>Version: unavailable — conflict detected</span>
      ) : (
        <span className={styles.versionChange}>
          <span className={styles.version}>{from}</span>
          <span className={styles.versionChangeArrow}>→</span>
          <span className={styles.version}>{to}</span>
        </span>
      )}
    </li>
  );
}

// ─── Integrity change item (Step 87) ─────────────────────────────────

/**
 * Renders a technology whose structural integrity verdict changed between
 * the two scans. Shows the before/after issue labels for each side, reusing
 * the Step 86 `integrityIssueLabel` presenter.
 */
function IntegrityChangeItem({
  detection,
}: {
  readonly detection: TechnologyComparison;
}): React.ReactElement {
  const before = detection.before;
  const after = detection.after;

  const beforeIssues =
    before?.integrity && !before.integrity.valid ? before.integrity.issues : null;
  const afterIssues = after?.integrity && !after.integrity.valid ? after.integrity.issues : null;

  const beforeLabel = beforeIssues ? beforeIssues.map(integrityIssueLabel).join(', ') : 'Valid';
  const afterLabel = afterIssues ? afterIssues.map(integrityIssueLabel).join(', ') : 'Valid';

  return (
    <li className={styles.changeItem}>
      <span className={styles.integrityChangeBadge}>integrity changed</span>
      {detection.name}
      <span className={styles.category}>{detection.category}</span>
      <span className={styles.integrityBefore}>Before: {beforeLabel}</span>
      <span className={styles.integrityAfter}>After: {afterLabel}</span>
    </li>
  );
}

// ─── Score change row ────────────────────────────────────────────────

function ScoreChangeRow({
  detection,
}: {
  readonly detection: TechnologyComparison;
}): React.ReactElement {
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

function EvidenceChangeList({
  changes,
}: {
  readonly changes: EvidenceComparison[];
}): React.ReactElement {
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

function EvidenceChangeRow({
  change,
}: {
  readonly change: EvidenceComparison;
}): React.ReactElement {
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
