/**
 * TechnologyCatalogView — client component for the technology catalog
 * with client-side search and category filtering.
 *
 * This is the client boundary for catalog filtering. It receives all
 * technologies (already fetched from the in-memory catalog by the server
 * component) and manages filter state locally, syncing to the URL via
 * `useRouter` and `useSearchParams`.
 *
 * Filtering is performed client-side using the pure `filterTechnologies()`
 * function — no network request is made when the user types.
 *
 * URL state: `/technologies?q=<search>&category=<category>`
 * - Page refresh preserves filters (server reads searchParams on initial render)
 * - Copied URLs preserve filters
 * - Invalid category values fall back to "All"
 *
 * The client boundary is kept minimal: only this component and its direct
 * children (`TechnologyFilters`, `ScanCard`-like list items) are client-side.
 * The server component still provides the initial catalog data.
 */

'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  filterTechnologies,
  isValidTechnologyCategory,
  buildTechnologyUrl,
} from '../lib/technology-filter';
import { TechnologyFilters } from './TechnologyFilters';
import styles from '../app/technologies/page.module.css';
import type { TechnologyPresentation } from '../lib/technology-catalog.js';

export interface TechnologyCatalogViewProps {
  /** All technologies from the catalog (unfiltered) */
  technologies: TechnologyPresentation[];
}

/**
 * Returns the sorted unique categories from the technology list.
 */
function extractCategories(technologies: TechnologyPresentation[]): string[] {
  const seen = new Set<string>();
  const cats: string[] = [];
  for (const tech of technologies) {
    if (!seen.has(tech.category)) {
      seen.add(tech.category);
      cats.push(tech.category);
    }
  }
  return cats.sort();
}

export function TechnologyCatalogView({
  technologies,
}: TechnologyCatalogViewProps): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize from URL (server-rendered initial state)
  const [search, setSearch] = useState<string>(() => {
    return searchParams?.get('q') ?? '';
  });

  const [category, setCategory] = useState<string>(() => {
    const raw = searchParams?.get('category') ?? '';
    return isValidTechnologyCategory(raw) ? raw : '';
  });

  // Keep state in sync if the URL changes externally (back/forward navigation)
  useEffect(() => {
    const q = searchParams?.get('q') ?? '';
    const c = searchParams?.get('category') ?? '';

    setSearch(q);
    setCategory(isValidTechnologyCategory(c) ? c : '');
  }, [searchParams]);

  // Sync state → URL (replaces current history entry, no new entries per keystroke)
  useEffect(() => {
    router.replace(buildTechnologyUrl(search, category), { scroll: false });
  }, [search, category, router]);

  const filters = { search, category };
  const filtered = filterTechnologies(technologies, filters);
  const categories = extractCategories(technologies);

  return (
    <>
      <TechnologyFilters
        search={search}
        category={category}
        categories={categories}
        resultCount={filtered.length}
        totalTechnologies={technologies.length}
        onSearchChange={setSearch}
        onCategoryChange={setCategory}
        onReset={() => {
          setSearch('');
          setCategory('');
        }}
      />

      {filtered.length > 0 ? (
        <ul className={styles.techList}>
          {filtered.map((tech) => (
            <li key={tech.id} className={styles.techItem}>
              <Link
                href={`/technologies/${encodeURIComponent(tech.id)}`}
                className={styles.techLink}
              >
                <span className={styles.techName}>{tech.name}</span>
                <span className={styles.techCategory}>{tech.category}</span>
              </Link>
              <p className={styles.techDescription}>{tech.description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty} />
      )}
    </>
  );
}
