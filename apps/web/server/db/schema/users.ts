import { pgTable, index } from 'drizzle-orm/pg-core';
import * as t from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: t.uuid().primaryKey().defaultRandom(),

    name: t.text('name'),
    email: t.varchar('email', { length: 320 }).notNull().unique(),
    /** Legacy hash retained for migration and rollback analysis. */
    passwordHash: t.text('password_hash'),
    legacyEmailVerified: t.timestamp('email_verified', { withTimezone: true, mode: 'date' }),
    emailVerified: t.boolean('is_email_verified').notNull().default(false),
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
