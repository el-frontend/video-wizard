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
