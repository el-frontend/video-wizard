import { sql } from 'drizzle-orm';
import { bigint, boolean, check, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

export const studioAssets = pgTable(
  'studio_assets',
  {
    id: uuid().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    hash: text().notNull(),
    name: text().notNull(),
    mediaType: text('media_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    durationMs: bigint('duration_ms', { mode: 'number' }),
    width: integer(),
    height: integer(),
    hasAudio: boolean('has_audio').notNull(),
  },
  (table) => [
    unique('studio_assets_owner_hash_unique').on(table.ownerId, table.hash),
    check('studio_assets_hash_format', sql`${table.hash} ~ '^[a-f0-9]{64}$'`),
    check('studio_assets_size_positive', sql`${table.sizeBytes} > 0`),
  ]
);
