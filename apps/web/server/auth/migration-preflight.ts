import { sql } from 'drizzle-orm';
import type { db } from '../db';

export async function migrationPreflight(database: typeof db) {
  // A brand-new database has no 0007 tables to inspect.
  const present = await database.execute<{ users: string | null }>(
    sql`SELECT to_regclass('users') AS users`
  );
  if (present.rows[0]?.users === null) {
    return {
      users: 0,
      legacyAccounts: 0,
      legacySessions: 0,
      legacyVerifications: 0,
      collisions: 0,
    };
  }
  // One snapshot; return counts only, including on a normalization collision.
  const result = await database.execute<{
    users: number;
    legacyAccounts: number;
    legacySessions: number;
    legacyVerifications: number;
    collisions: number;
  }>(sql`SELECT
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM accounts) AS "legacyAccounts",
    (SELECT count(*)::int FROM sessions) AS "legacySessions",
    (SELECT count(*)::int FROM verification_tokens) AS "legacyVerifications",
    (SELECT count(*)::int FROM (
      SELECT lower(regexp_replace(email, '^[[:space:]]+|[[:space:]]+$', '', 'g')) FROM users GROUP BY lower(regexp_replace(email, '^[[:space:]]+|[[:space:]]+$', '', 'g')) HAVING count(*) > 1
    ) groups) AS collisions`);
  return result.rows[0]!;
}
