import { pgTable, index } from 'drizzle-orm/pg-core';
import * as t from 'drizzle-orm/pg-core';

/**
 * Users table
 *
 * Auth-provider agnostic: stores the canonical user identity that other
 * tables (jobs, etc.) reference via foreign key. Any auth solution
 * (NextAuth.js, Clerk, Lucia, custom) can populate these rows on signup.
 */
export const users = pgTable(
  'users',
  {
    id: t.uuid().primaryKey().defaultRandom(),

    email: t.varchar('email', { length: 320 }).notNull().unique(),
    name: t.varchar('name', { length: 255 }),
    imageUrl: t.text('image_url'),

    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('users_email_idx').on(table.email)]
);
