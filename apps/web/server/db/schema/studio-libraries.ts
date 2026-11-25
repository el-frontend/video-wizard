import { LibraryKindSchema, type LibraryEntry } from '@workspace/video-project';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  json,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './users';

export const studioLibraryKind = pgEnum('studio_library_kind', LibraryKindSchema.enum);

export const studioLibraries = pgTable(
  'studio_libraries',
  {
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text().notNull(),
    version: bigint({ mode: 'number' }).notNull(),
    kind: studioLibraryKind().notNull(),
    entry: json().$type<LibraryEntry>().notNull(),
    listed: boolean().notNull().default(true),
    bundleHash: text('bundle_hash'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id, table.version] }),
    index('studio_libraries_owner_kind_idx').on(table.ownerId, table.kind),
    check('studio_libraries_version_positive', sql`${table.version} > 0`),
    check('studio_libraries_bundle_hash_format', sql`${table.bundleHash} ~ '^[a-f0-9]{64}$'`),
  ]
);
