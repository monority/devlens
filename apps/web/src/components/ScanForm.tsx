/**
 * Client component that wires up the scan creation form with state management
 * and API calls.
 *
 * This is the ONLY client component in the scan creation flow. It manages:
 * - local URL input state
 * - client-side validation (immediate feedback)
 * - submitting / loading state
 * - API error handling (400 validation errors and 500 infrastructure errors)
 * - navigation to `/scans/{id}` on successful creation
 *
 * Data fetching is delegated to the typed API client (`lib/api.ts` → `createScan`).
 * The browser never touches the database, repositories, or domain packages.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createScan, ApiError, extractErrorMessage } from '@/lib/api';
import { validateUrl } from '@/lib/validation';
import { ScanFormView } from '@/components/ScanFormView';

export function ScanForm(): React.ReactElement {
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Client-side validation — immediate feedback, but the server
    // remains authoritative.
    const validationError = validateUrl(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // POST /api/scans — may return 200 with a completed or failed scan.
      const result = await createScan(url);

      // A 200 response means the scan was created (even if status is
      // "failed" — that is a domain outcome, not an HTTP failure).
      // Navigate to the detail page.
      router.push(`/scans/${result.scan.id}`);
    } catch (e) {
      // ApiError: 400 (server validation) or 500 (infrastructure).
      // The error body contains a safe, user-facing message.
      if (e instanceof ApiError) {
        setError(extractErrorMessage(e.body));
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScanFormView
      url={url}
      error={error}
      isSubmitting={isSubmitting}
      onUrlChange={setUrl}
      onSubmit={handleSubmit}
    />
  );
}
