import { pgTable, index } from 'drizzle-orm/pg-core';
import * as t from 'drizzle-orm/pg-core';

/**
 * Users table
 *
 * Column shape matches Auth.js (NextAuth) DrizzleAdapter expectations
 * (id, name, email, emailVerified, image) so the adapter can use this
 * table directly. Extra columns (createdAt, updatedAt) are ignored by
 * the adapter and used by the rest of the app.
 */
export const users = pgTable(
  'users',
  {
    id: t.uuid().primaryKey().defaultRandom(),

    name: t.varchar('name', { length: 255 }),
    email: t.varchar('email', { length: 320 }).notNull().unique(),
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
