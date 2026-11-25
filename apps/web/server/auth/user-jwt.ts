import { and, eq, gt } from 'drizzle-orm';
import { createLocalJWKSet, errors, jwtVerify } from 'jose';
import { z } from 'zod';

import type { db } from '../db';
import { authSessions, users } from '../db/schema';
import { type AuthServer, USER_AUDIENCE, USER_TOKEN_SECONDS } from './config';

const profile = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  token_use: z.literal('user'),
  iat: z.int(),
  exp: z.int(),
  aud: z.literal(USER_AUDIENCE),
});

export async function resolveIdentity(
  database: typeof db,
  server: AuthServer,
  headers: Headers,
  method = 'GET'
) {
  const issuer = server.options.baseURL;
  const authorization = headers.get('authorization');
  if (authorization !== null) {
    const match = /^Bearer ([^\s,]+)$/i.exec(authorization);
    if (!match) return null;
    const keys = await server.api.getJwks();
    try {
      const { payload, protectedHeader } = await jwtVerify(match[1]!, createLocalJWKSet(keys), {
        algorithms: ['EdDSA'],
        issuer,
        audience: USER_AUDIENCE,
        maxTokenAge: USER_TOKEN_SECONDS,
        requiredClaims: ['exp', 'iat', 'sub', 'sid', 'token_use'],
      });
      const parsed = profile.safeParse(payload);
      if (!protectedHeader.kid || !parsed.success) return null;
      const { sub, sid, exp, iat } = parsed.data;
      if (exp <= iat || exp - iat > USER_TOKEN_SECONDS) return null;
      const [row] = await database
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          image: users.image,
        })
        .from(users)
        .innerJoin(authSessions, eq(authSessions.userId, users.id))
        .where(
          and(eq(users.id, sub), eq(authSessions.id, sid), gt(authSessions.expiresAt, new Date()))
        );
      return row ? { user: row, session: { id: sid } } : null;
    } catch (error) {
      if (error instanceof errors.JOSEError) return null;
      throw error;
    }
  }

  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) &&
    headers.get('origin') !== issuer
  )
    return null;
  // Only a browser-visible session response can deliver the renewed cookie.
  const identity = await server.api.getSession({ headers, query: { disableRefresh: true } });
  if (!identity) return null;
  const { id, email, name, image } = identity.user;
  return { user: { id, email, name, image: image ?? null }, session: { id: identity.session.id } };
}
