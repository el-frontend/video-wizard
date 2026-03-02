import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { requireEnv } from '../lib/utils';

import * as schema from './schema';

/**
 * PostgreSQL connection pool
 *
 * Uses requireEnv to throw a clear ConfigurationError at startup
 * if DATABASE_URL is not set, rather than failing silently at first query.
 */
const pool = new Pool({
  connectionString: requireEnv('DATABASE_URL'),
});

/**
 * Drizzle ORM client instance
 *
 * Import directly from '@/server/db' in services that need database access.
 *
 * Usage:
 * ```ts
 * import { db } from '@/server/db';
 * const users = await db.select().from(schema.users);
 * ```
 */
export const db = drizzle({ client: pool, schema });
