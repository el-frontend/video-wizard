import { pgTable, primaryKey } from 'drizzle-orm/pg-core';
import * as t from 'drizzle-orm/pg-core';

import { users } from './users';

/**
 * Auth.js (NextAuth) tables.
 *
 * Column names and types follow the Auth.js DrizzleAdapter
 * DefaultPostgresSchema so the adapter can read/write them directly.
 * See: https://authjs.dev/reference/drizzle-adapter/lib/pg
 */

// ---------------------------------------------------------------------------
// Accounts (one row per OAuth provider link to a user; unused for magic-link
// only flows but required by the adapter when OAuth is added later)
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  'accounts',
  {
    userId: t
      .uuid('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: t.text('type').notNull(),
    provider: t.text('provider').notNull(),
    providerAccountId: t.text('providerAccountId').notNull(),
    refresh_token: t.text('refresh_token'),
    access_token: t.text('access_token'),
    expires_at: t.integer('expires_at'),
    token_type: t.text('token_type'),
    scope: t.text('scope'),
    id_token: t.text('id_token'),
    session_state: t.text('session_state'),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })]
);

// ---------------------------------------------------------------------------
// Sessions (only used when sessionStrategy is 'database'; harmless when JWT)
// ---------------------------------------------------------------------------

export const sessions = pgTable('sessions', {
  sessionToken: t.text('sessionToken').primaryKey(),
  userId: t
    .uuid('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: t.timestamp('expires', { mode: 'date' }).notNull(),
});

// ---------------------------------------------------------------------------
// Verification tokens (required for magic-link / email provider)
// ---------------------------------------------------------------------------

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: t.text('identifier').notNull(),
    token: t.text('token').notNull(),
    expires: t.timestamp('expires', { mode: 'date' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })]
);

// Better Auth tables are independent of the retained Auth.js tables above.
const authId = () => t.uuid('id').defaultRandom().primaryKey();
const authDate = (name: string) => t.timestamp(name, { withTimezone: true });
const owner = () =>
  t
    .uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });
const timestamps = () => ({
  createdAt: authDate('created_at').notNull().defaultNow(),
  updatedAt: authDate('updated_at').notNull().defaultNow(),
});

export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: authId(),
    userId: owner(),
    accountId: t.text('account_id').notNull(),
    providerId: t.text('provider_id').notNull(),
    password: t.text('password'),
    accessToken: t.text('access_token'),
    refreshToken: t.text('refresh_token'),
    accessTokenExpiresAt: authDate('access_token_expires_at'),
    refreshTokenExpiresAt: authDate('refresh_token_expires_at'),
    idToken: t.text('id_token'),
    scope: t.text('scope'),
    ...timestamps(),
  },
  (table) => [
    t.unique('auth_accounts_provider_account_unique').on(table.providerId, table.accountId),
    t.index('auth_accounts_user_idx').on(table.userId),
  ]
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: authId(),
    userId: owner(),
    token: t.text('token').notNull().unique(),
    expiresAt: authDate('expires_at').notNull(),
    ipAddress: t.text('ip_address'),
    userAgent: t.text('user_agent'),
    ...timestamps(),
  },
  (table) => [t.index('auth_sessions_user_idx').on(table.userId)]
);

export const authVerifications = pgTable(
  'auth_verifications',
  {
    id: authId(),
    identifier: t.text('identifier').notNull(),
    value: t.text('value').notNull(),
    expiresAt: authDate('expires_at').notNull(),
    ...timestamps(),
  },
  (table) => [t.index('auth_verifications_identifier_idx').on(table.identifier)]
);

export const authJwks = pgTable('auth_jwks', {
  id: authId(),
  publicKey: t.text('public_key').notNull(),
  privateKey: t.text('private_key').notNull(),
  createdAt: authDate('created_at').notNull(),
  expiresAt: authDate('expires_at'),
  alg: t.text('alg'),
  crv: t.text('crv'),
});
