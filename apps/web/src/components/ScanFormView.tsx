/**
 * Pure presentation component for the scan creation form.
 *
 * This is a stateless component that receives all data and handlers as props.
 * It can be tested with `renderToString` from `react-dom/server` because it
 * is a pure function with no hooks or side effects.
 *
 * The actual client component (`ScanForm`) wraps this with state management
 * and API calls.
 */

import styles from './ScanForm.module.css';

export interface ScanFormViewProps {
  /** Current value of the URL input field. */
  url: string;
  /** Error message to display (from client validation or API error). */
  error: string | null;
  /** Whether a scan is currently being submitted. */
  isSubmitting: boolean;
  /** Called when the URL input changes. */
  onUrlChange: (url: string) => void;
  /** Called when the form is submitted. */
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

/**
 * Renders the scan creation form — a URL input, an error message (when
 * present), and a submit button that shows "Starting scan…" while
 * submitting.
 */
export function ScanFormView({
  url,
  error,
  isSubmitting,
  onUrlChange,
  onSubmit,
}: ScanFormViewProps): React.ReactElement {
  return (
    <form onSubmit={onSubmit} className={styles.form} data-testid="scan-form">
      <div className={styles.field}>
        <label htmlFor="scan-url" className={styles.label}>
          Target URL
        </label>
        <input
          id="scan-url"
          type="url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://example.com"
          disabled={isSubmitting}
          aria-invalid={!!error}
          autoComplete="url"
          className={styles.input}
        />
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={isSubmitting} className={styles.button}>
        {isSubmitting ? 'Starting scan…' : 'Start scan'}
      </button>
    </form>
  );
}
