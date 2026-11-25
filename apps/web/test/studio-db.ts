import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import * as schema from '../server/db/schema';

export async function openStudioTestDb() {
  config({
    path: fileURLToPath(new URL('../../../.env.studio-test', import.meta.url)),
    quiet: true,
  });
  const connectionString = process.env.STUDIO_TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Set STUDIO_TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test.'
    );
  }

  const database = decodeURIComponent(new URL(connectionString).pathname.slice(1));
  if (!/^[a-zA-Z0-9_]+_test$/.test(database)) {
    throw new Error('STUDIO_TEST_DATABASE_URL must name a dedicated database ending in _test.');
  }

  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool, schema });
  const ownerIds: string[] = [];

  try {
    const client = await pool.connect();
    try {
      const result = await client.query<{ name: string }>('SELECT current_database() AS name');
      if (result.rows[0]?.name !== database)
        throw new Error('Unexpected PostgreSQL test database.');
      // Serialize fixture migrations if multiple test suites open the same database.
      await client.query("SELECT pg_advisory_lock(hashtext('video-wizard-studio-test-migrate'))");
      try {
        await migrate(drizzle(client), {
          migrationsFolder: fileURLToPath(new URL('../server/db/migrations', import.meta.url)),
        });
      } finally {
        await client.query(
          "SELECT pg_advisory_unlock(hashtext('video-wizard-studio-test-migrate'))"
        );
      }
    } finally {
      client.release();
    }
  } catch (error) {
    await pool.end();
    throw error;
  }

  return {
    db,
    async createOwner() {
      const id = randomUUID();
      await db.insert(schema.users).values({ id, email: `studio-test-${id}@example.test` });
      ownerIds.push(id);
      return id;
    },
    async close() {
      try {
        if (ownerIds.length)
          await db.delete(schema.users).where(inArray(schema.users.id, ownerIds));
      } finally {
        await pool.end();
      }
    },
  };
}
