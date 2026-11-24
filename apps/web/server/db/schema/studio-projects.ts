import { EngineIdSchema, type ImportContext, type ProjectDraft } from '@workspace/video-project';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  timestamp,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './users';

export const studioEngine = pgEnum('studio_engine', EngineIdSchema.enum);
export const studioRevisionOperation = pgEnum('studio_revision_operation', [
  'create',
  'save',
  'restore',
  'duplicate',
  'import',
  'repair',
]);

export const studioProjects = pgTable(
  'studio_projects',
  {
    id: uuid().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    engine: studioEngine().notNull(),
    revision: uuid().notNull(),
  },
  (table) => [
    index('studio_projects_owner_idx').on(table.ownerId),
    unique('studio_projects_id_owner_unique').on(table.id, table.ownerId),
  ]
);

export const studioProjectRevisions = pgTable(
  'studio_project_revisions',
  {
    revision: uuid().primaryKey(),
    projectId: uuid('project_id').notNull(),
    authorId: uuid('author_id').notNull(),
    sequence: integer().notNull(),
    document: json().$type<ProjectDraft>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    importContext: json('import_context').$type<ImportContext>(),
    operation: studioRevisionOperation().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'studio_project_revisions_project_owner_fk',
      columns: [table.projectId, table.authorId],
      foreignColumns: [studioProjects.id, studioProjects.ownerId],
    }).onDelete('cascade'),
    unique('studio_project_revisions_sequence_unique').on(table.projectId, table.sequence),
    check('studio_project_revisions_sequence_positive', sql`${table.sequence} > 0`),
  ]
);

export const studioImports = pgTable(
  'studio_imports',
  {
    projectId: uuid('project_id').primaryKey(),
    ownerId: uuid('owner_id').notNull(),
    kind: text().notNull(),
    sourceId: text('source_id').notNull(),
    hash: text().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'studio_imports_project_owner_fk',
      columns: [table.projectId, table.ownerId],
      foreignColumns: [studioProjects.id, studioProjects.ownerId],
    }).onDelete('cascade'),
    unique('studio_imports_identity_unique').on(
      table.ownerId,
      table.kind,
      table.sourceId,
      table.hash
    ),
  ]
);
