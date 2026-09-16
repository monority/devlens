/**
 * Drizzle ORM schema for the `scans` and `snapshots` tables.
 *
 * This schema maps the domain model (Scan, ScanStatus, SiteSnapshot)
 * to PostgreSQL tables. It lives in the infrastructure layer and is
 * never imported by `@devlens/application` or `@devlens/core`.
 *
 * Design decisions:
 * - `scans.id` uses the domain `ScanId` as the primary key (no
 *   separate database-generated ID).
 * - `snapshots.scan_id` is both the primary key and a foreign key to
 *   `scans.id` — `SiteSnapshot` has no independent domain identity,
 *   so it is identified by its parent scan.
 * - `ScanStatus` (a discriminated union) is flattened into columns:
 *   a `status` text column plus status-specific timestamp/error columns.
 * - `HttpObservation.headers` and `SiteSnapshot.resources` are stored
 *   as `jsonb` — they are small value-object arrays without independent
 *   identity, so a separate child table would be over-normalization.
 */

import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

/**
 * Persisted representation of a {@link Scan}.
 *
 * The `status` column holds one of: `'pending'`, `'running'`,
 * `'completed'`, `'failed'`. Only the columns relevant to the
 * current status are populated; the rest are `NULL`.
 */
export const scans = pgTable('scans', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  hostname: text('hostname').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
});

/**
 * Persisted representation of a {@link SiteSnapshot}.
 *
 * `scan_id` is the primary key and foreign key — a snapshot belongs
 * to exactly one scan. There is a 1:1 relationship.
 */
export const snapshots = pgTable('snapshots', {
  scanId: text('scan_id')
    .primaryKey()
    .references(() => scans.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  hostname: text('hostname').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  httpStatusCode: integer('http_status_code').notNull(),
  httpContentType: text('http_content_type').notNull(),
  httpFinalUrl: text('http_final_url').notNull(),
  htmlTitle: text('html_title').notNull(),
  htmlDescription: text('html_description'),
  htmlMetaTags: jsonb('html_meta_tags').notNull(),
  htmlScripts: jsonb('html_scripts').notNull(),
  headers: jsonb('headers').notNull(),
  resources: jsonb('resources').notNull(),
  detections: jsonb('detections').notNull(),
});
