import {
  foreignKey,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  AssistantProvider,
  CompanionRequest,
  CompanionRequestInput,
} from '@workspace/video-project';
import { studioProjects, studioProjectRevisions } from './studio-projects';
import { studioAssets } from './studio-assets';
import { studioProposals } from './studio-proposals';

const ownerProject = () => ({
  ownerId: uuid('owner_id').notNull(),
  projectId: uuid('project_id').notNull(),
});
// Each capability has a distinct purpose and only its digest is stored.
export const studioPairings = pgTable(
  'studio_pairings',
  {
    digest: text().primaryKey(),
    ...ownerProject(),
    expires: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.projectId, t.ownerId],
      foreignColumns: [studioProjects.id, studioProjects.ownerId],
    }).onDelete('cascade'),
  ]
);
export const studioBindings = pgTable(
  'studio_bindings',
  {
    bindingId: uuid('binding_id').notNull(),
    ...ownerProject(),
    provider: text().$type<AssistantProvider>().notNull(),
    digest: text().notNull().unique(),
    expires: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.projectId, t.bindingId] }),
    foreignKey({
      columns: [t.projectId, t.ownerId],
      foreignColumns: [studioProjects.id, studioProjects.ownerId],
    }).onDelete('cascade'),
  ]
);
export const studioRequests = pgTable(
  'studio_requests',
  {
    id: uuid().primaryKey(),
    ...ownerProject(),
    bindingId: uuid('binding_id').notNull(),
    payload: jsonb().$type<CompanionRequestInput>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text().$type<CompanionRequest['status']>().notNull(),
    note: text(),
    attemptId: uuid('attempt_id').unique(),
    attemptDigest: text('attempt_digest').unique(),
    attemptExpires: timestamp('attempt_expires', { withTimezone: true }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    generationStarted: timestamp('generation_started', { withTimezone: true }),
    resultRevision: uuid('result_revision').references(() => studioProjectRevisions.revision, {
      onDelete: 'set null',
    }),
    proposalId: uuid('proposal_id').references(() => studioProposals.id, { onDelete: 'set null' }),
    assetId: uuid('asset_id').references(() => studioAssets.id, { onDelete: 'set null' }),
    ranges: jsonb().$type<NonNullable<CompanionRequest['ranges']>>(),
    actionDigest: text('action_digest'),
    voice: jsonb().$type<NonNullable<CompanionRequest['voice']>>(),
    delivery: jsonb().$type<NonNullable<CompanionRequest['delivery']>>(),
  },
  (t) => [
    unique().on(t.ownerId, t.projectId, t.idempotencyKey),
    foreignKey({
      columns: [t.ownerId, t.projectId, t.bindingId],
      foreignColumns: [studioBindings.ownerId, studioBindings.projectId, studioBindings.bindingId],
    }).onDelete('cascade'),
  ]
);
