import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { jwt } from 'better-auth/plugins/jwt';

import type { db } from '../db';
import { authAccounts, authJwks, authSessions, authVerifications, users } from '../db/schema';
import { hashPassword, verifyPassword } from '../lib/password';

export const USER_AUDIENCE = 'video-wizard-api';
export const USER_TOKEN_SECONDS = 15 * 60;

export function createAuth(database: typeof db, options: { baseURL: string; secret: string }) {
  const url = new URL(options.baseURL);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.hostname.includes('*') ||
    options.baseURL !== url.origin
  ) {
    throw new Error('BETTER_AUTH_URL must be an HTTP(S) origin without a trailing slash.');
  }
  // Better Auth also appends this environment value to trustedOrigins.
  const extraOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  if (extraOrigins && extraOrigins.split(',').some((origin) => origin !== url.origin)) {
    throw new Error('BETTER_AUTH_TRUSTED_ORIGINS must contain only BETTER_AUTH_URL.');
  }
  if (
    Buffer.byteLength(options.secret) < 32 ||
    options.secret === process.env.STUDIO_RENDER_SECRET
  ) {
    throw new Error(
      'BETTER_AUTH_SECRET must be at least 32 bytes and distinct from STUDIO_RENDER_SECRET.'
    );
  }
  return betterAuth({
    ...options,
    database: drizzleAdapter(database, {
      provider: 'pg',
      transaction: true,
      schema: {
        user: users,
        account: authAccounts,
        session: authSessions,
        verification: authVerifications,
        jwks: authJwks,
      },
    }),
    trustedOrigins: [url.origin],
    logger: { disabled: true },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: { generateId: 'uuid' },
      useSecureCookies: url.protocol === 'https:',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    session: { expiresIn: 7 * 86400, updateAge: 86400, cookieCache: { enabled: false } },
    // In 1.7.27 sign-in shares the new-password length limit. The before hook
    // returns a partial *request* context; no shared option is ever changed.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-in/email') {
          return {
            context: {
              context: { password: { config: { maxPasswordLength: Number.MAX_SAFE_INTEGER } } },
            },
          };
        }
      }),
    },
    plugins: [
      jwt({
        disableSettingJwtHeader: true,
        jwks: { keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' } },
        jwt: {
          issuer: url.origin,
          audience: USER_AUDIENCE,
          expirationTime: '15m',
          definePayload: ({ session }) => ({ sid: session.id, token_use: 'user' }),
        },
      }),
    ],
  });
}

export type AuthServer = ReturnType<typeof createAuth>;
