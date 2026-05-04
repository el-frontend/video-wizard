import { pgTable, index } from 'drizzle-orm/pg-core';
import * as t from 'drizzle-orm/pg-core';

/**
 * Users table
 *
 * Email + bcrypt password authentication. The shape (id, name, email,
 * emailVerified, image) is also compatible with the Auth.js DrizzleAdapter
 * in case OAuth providers are added later — the auth/* tables already
 * exist for that, but the current sign-in flow uses Credentials only.
 */
export const users = pgTable(
  'users',
  {
    id: t.uuid().primaryKey().defaultRandom(),

    name: t.varchar('name', { length: 255 }),
    email: t.varchar('email', { length: 320 }).notNull().unique(),
    /** bcrypt hash of the user's password. Null for users created via OAuth. */
    passwordHash: t.text('password_hash'),
    emailVerified: t.timestamp('email_verified', { withTimezone: true, mode: 'date' }),
    image: t.text('image_url'),

    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('users_email_idx').on(table.email)]
);
