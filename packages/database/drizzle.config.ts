/**
 * Drizzle Kit configuration for @devlens/database.
 *
 * Run from the package directory:
 *   pnpm db:generate  — generate migration SQL from the schema
 *   pnpm db:migrate   — apply pending migrations to PostgreSQL
 *   pnpm db:push      — push schema changes directly (dev convenience)
 */

import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. drizzle-kit requires a database URL to ' +
      'run migrations. Set DATABASE_URL in your environment or .env file.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
});
