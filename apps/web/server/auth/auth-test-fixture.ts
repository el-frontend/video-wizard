import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../db/schema';

export const baseURL = 'https://studio.example.test';
export const authOptions = { baseURL, secret: randomBytes(48).toString('hex') };
let workspace = process.cwd();
while (!existsSync(join(workspace, 'pnpm-workspace.yaml'))) {
  const parent = dirname(workspace);
  if (parent === workspace) throw new Error('Workspace not found');
  workspace = parent;
}
const migrations = join(workspace, 'apps/web/server/db/migrations');

export async function authFixture(lastMigration = Infinity) {
  config({
    path: join(workspace, '.env.studio-test'),
    quiet: true,
  });
  const connectionString = process.env.STUDIO_TEST_DATABASE_URL;
  if (!connectionString) throw new Error('STUDIO_TEST_DATABASE_URL is required');
  const name = decodeURIComponent(new URL(connectionString).pathname.slice(1));
  if (!/^\w+_test$/.test(name)) throw new Error('Expected a dedicated _test database');
  const namespace = 'auth_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString, options: '-csearch_path=' + namespace });
  const db = drizzle({ client: pool, schema });
  async function close() {
    try {
      await pool.query('DROP SCHEMA "' + namespace + '" CASCADE');
    } finally {
      await pool.end();
    }
  }
  async function apply(filename: string) {
    const sql = (await readFile(join(migrations, filename), 'utf8')).replaceAll(
      '"public".',
      '"' + namespace + '".'
    );
    await pool.query(sql);
  }
  if ((await pool.query('SELECT current_database() AS db')).rows[0].db !== name) {
    await pool.end();
    throw new Error('Unexpected database');
  }
  await pool.query('CREATE SCHEMA "' + namespace + '"');
  try {
    for (const filename of (await readdir(migrations)).sort()) {
      if (/^\d+.*\.sql$/.test(filename) && parseInt(filename, 10) <= lastMigration)
        await apply(filename);
    }
    const scoped = new URL(connectionString);
    scoped.searchParams.set('options', '-csearch_path=' + namespace);
    return { db, pool, apply, close, connectionString: scoped.toString() };
  } catch (error) {
    await close();
    throw error;
  }
}

export function protocol(path: string, body?: Record<string, unknown>, cookie?: string) {
  const headers = new Headers({ origin: baseURL });
  if (cookie) headers.set('cookie', cookie);
  if (body) headers.set('content-type', 'application/json');
  return new Request(baseURL + '/api/auth/' + path, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function responseCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ');
}
