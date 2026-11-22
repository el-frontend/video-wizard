import { headers } from 'next/headers';
import { db } from '@/server/db';
import { createAuth } from '@/server/auth/config';
import { resolveIdentity } from '@/server/auth/user-jwt';
import { requireEnv } from '@/server/lib/utils';

export const betterAuthServer = createAuth(db, {
  baseURL: requireEnv('BETTER_AUTH_URL'),
  secret: requireEnv('BETTER_AUTH_SECRET'),
});

export async function auth(request?: Request) {
  return resolveIdentity(
    db,
    betterAuthServer,
    request?.headers ?? (await headers()),
    request?.method
  );
}
