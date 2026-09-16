/**
 * DetectionFilterView — client component for scan detail detection
 * filtering with URL deep linking.
 *
 * This is the client boundary for detection filtering. It receives the
 * raw detections (already fetched from the API by the server component)
 * and manages filter state locally, syncing to the URL via
 * `useRouter` and `useSearchParams`.
 *
 * Filtering is performed client-side using the pure `filterDetections()``
 * function — no network request is made when the user types.
 *
 * URL state: `/scans/{id}?q=<search>&category=<category>`
 * - Page refresh preserves filters (server reads searchParams on initial render)
 * - Copied URLs preserve filters
 * - Invalid category values fall back to "All"
 *
 * The client boundary is kept minimal: only this component and its
 * direct children (DetectionFilters, DetectionList) are client-side.
 * The server component still provides the initial detections data.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  filterDetections,
  isValidDetectionCategory,
  buildDetectionUrl,
  getDetectionCategories,
} from '../lib/detection-filter';
import { DetectionFilters } from './DetectionFilters';
import { ScanDetectionResults } from './ScanDetectionResults';
import type { DetectionResponse } from '../lib/types.js';
import type { DetectionFilters as DetectionFiltersState } from '../lib/detection-filter.js';

export interface DetectionFilterViewProps {
  /** The raw detections from the scan result (unfiltered) */
  detections: DetectionResponse[];
  /** The scan ID (used for URL construction) */
  scanId: string;
  /** Initial query from the server-rendered URL */
  initialQuery: string;
  /** Initial category from the server-rendered URL */
  initialCategory: string;
}

export function DetectionFilterView({
  detections,
  scanId,
  initialQuery,
  initialCategory,
}: DetectionFilterViewProps): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize from server-rendered props, with URL override for
  // back/forward navigation after first render.
  const [query, setQuery] = useState<string>(() => {
    const urlQuery = searchParams?.get('q') ?? '';
    return urlQuery || initialQuery || '';
  });

  const [category, setCategory] = useState<string>(() => {
    const urlCategory = searchParams?.get('category') ?? '';
    const valid = isValidDetectionCategory(urlCategory || initialCategory || null);
    return valid ? urlCategory || initialCategory || '' : '';
  });

  // Keep state in sync if the URL changes externally (back/forward navigation)
  useEffect(() => {
    const urlQuery = searchParams?.get('q') ?? '';
    const urlCategory = searchParams?.get('category') ?? '';

    setQuery(urlQuery || initialQuery || '');
    const valid = isValidDetectionCategory(urlCategory || initialCategory || null);
    setCategory(valid ? urlCategory || initialCategory || '' : '');
  }, [searchParams, initialQuery, initialCategory]);

  // Sync state → URL (replaces current history entry, no new entries per keystroke)
  useEffect(() => {
    const url = buildDetectionUrl(scanId, query, category);
    router.replace(url, { scroll: false });
  }, [query, category, scanId, router]);

  const filters: DetectionFiltersState = { query, category };
  const filtered = filterDetections(detections, filters);
  const categories = getDetectionCategories();

  return (
    <>
      <DetectionFilters
        search={query}
        category={category}
        categories={categories}
        resultCount={filtered.length}
        totalDetections={detections.length}
        onSearchChange={setQuery}
        onCategoryChange={setCategory}
        onReset={() => {
          setQuery('');
          setCategory('');
        }}
      />
      <ScanDetectionResults detections={filtered} />
    </>
  );
}
