/**
 * Drizzle PostgreSQL client factory.
 *
 * This module is the only place that references `postgres` (postgres.js)
 * and `drizzle-orm/postgres-js` in the entire workspace. The worker
 * and application layer import `createDatabaseClient` from
 * `@devlens/database` without touching Drizzle or postgres directly.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

/**
 * Type of the Drizzle database instance used throughout the
 * production adapter. This is infrastructure-layer plumbing;
 * the application layer never sees it.
 */
export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Creates a typed Drizzle database client connected to PostgreSQL.
 *
 * The connection URL is resolved in priority order:
 * 1. Explicitly passed `databaseUrl` parameter (useful for tests).
 * 2. The `DATABASE_URL` environment variable (production default).
 *
 * @throws Error if no URL can be resolved — the caller must set
 *   `DATABASE_URL` or pass it explicitly. We never silently fall
 *   back to an in-memory adapter in production.
 */
export function createDatabaseClient(databaseUrl?: string): Database {
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not configured. ' +
        'Set the DATABASE_URL environment variable to your PostgreSQL connection string, ' +
        'or pass the URL explicitly to createDatabaseClient(url).',
    );
  }
  const client = postgres(url);
  return drizzle(client, { schema });
}
