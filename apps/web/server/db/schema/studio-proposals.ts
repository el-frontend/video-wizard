import { foreignKey, json, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { Diagnostic, EntryOf, ProposalInput } from '@workspace/video-project';
import { studioProjects, studioProjectRevisions } from './studio-projects';

// The proposal owns the unpublished bytes through bundleHash, even after a CAS conflict.
export const studioProposals = pgTable(
  'studio_proposals',
  {
    id: uuid().primaryKey(),
    ownerId: uuid('owner_id').notNull(),
    projectId: uuid('project_id').notNull(),
    baseRevision: uuid('base_revision')
      .notNull()
      .references(() => studioProjectRevisions.revision),
    requestId: uuid('request_id').notNull(),
    sourceDigest: text('source_digest').notNull(),
    input: json().$type<ProposalInput>().notNull(),
    candidate: json().$type<EntryOf<'component'>>(),
    bundleHash: text('bundle_hash'),
    moduleHash: text('module_hash'),
    samples: json().$type<{ frame: number; sha256: string }[]>(),
    diagnostics: json().$type<Diagnostic[]>().notNull(),
    status: text().$type<'ready' | 'invalid' | 'applied'>().notNull(),
    appliedRevision: uuid('applied_revision').references(() => studioProjectRevisions.revision),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.projectId, t.ownerId],
      foreignColumns: [studioProjects.id, studioProjects.ownerId],
    }).onDelete('cascade'),
    unique('studio_proposals_delivery_unique').on(
      t.ownerId,
      t.projectId,
      t.requestId,
      t.baseRevision,
      t.sourceDigest
    ),
  ]
);
