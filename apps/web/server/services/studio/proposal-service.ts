import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { libraryKey, validateSnapshot } from '@workspace/render-contract';
import {
  digest,
  verifyModule,
  componentSourceHash,
} from '@workspace/render-contract/component-bundle';
import {
  ProposalInputSchema,
  ProposalDeliverySchema,
  type ProposalDelivery,
  type ProposalInput,
  type ProjectRecord,
  type Diagnostic,
  type EntryOf,
} from '@workspace/video-project';
import type { db } from '@/server/db';
import { studioLibraries, studioProposals, studioRequests } from '@/server/db/schema';
import { ValidationError } from '@/server/lib/utils';
import { AssetService } from './asset-service';
import { LibraryService, LibraryConflictError } from './library-service';
import { LibraryBundles } from './library-bundles';
import { snapshotBuilder } from './snapshot-service';
import {
  advanceRevision,
  currentRevision,
  ConflictError,
  ProjectNotFoundError,
  ProjectService,
  readBaseRevision,
  revisionForProject,
  toRecord,
} from './project-service';
import {
  candidateDocument,
  checkAtRenderer,
  changedReviewLayers,
  compileAtRenderer,
  previewCandidate,
} from './component-validation';

type StageSummary = { proposalId: string; diagnostics: Diagnostic[]; previewUrl?: string };
type Row = typeof studioProposals.$inferSelect;
type Database = Pick<typeof db, 'select' | 'insert' | 'update' | 'transaction'>;
const where = (owner: string, project: string, id: string) => {
  if (!z.uuid().safeParse(id).success) throw new ProjectNotFoundError();
  return and(
    eq(studioProposals.ownerId, owner),
    eq(studioProposals.projectId, project),
    eq(studioProposals.id, id)
  );
};
function inputHash(input: ProposalDelivery) {
  return digest(
    JSON.stringify(input, (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : value
    )
  );
}
export class ProposalService {
  private readonly projects: ProjectService;
  private readonly library: LibraryService;
  private readonly bundles: LibraryBundles;
  constructor(
    private readonly database: Database,
    private readonly dir?: string,
    private readonly compile = compileAtRenderer,
    private readonly check = checkAtRenderer
  ) {
    this.projects = new ProjectService(database, dir);
    this.library = new LibraryService(database, dir);
    this.bundles = new LibraryBundles(dir);
  }
  async get(owner: string, project: string, id: string) {
    const [row] = await this.database
      .select()
      .from(studioProposals)
      .where(where(owner, project, id));
    if (!row) throw new ProjectNotFoundError('Propuesta no encontrada.');
    return row;
  }
  async list(owner: string, project: string) {
    await this.projects.get(owner, project);
    return this.database
      .select({
        id: studioProposals.id,
        status: studioProposals.status,
        baseRevision: studioProposals.baseRevision,
        createdAt: studioProposals.createdAt,
      })
      .from(studioProposals)
      .where(and(eq(studioProposals.ownerId, owner), eq(studioProposals.projectId, project)))
      .orderBy(desc(studioProposals.createdAt));
  }
  private async candidate(
    owner: string,
    input: Extract<ProposalInput, { kind: 'component' }>
  ): Promise<EntryOf<'component'>> {
    let ref = { id: randomUUID() as string, version: 1 };
    if (input.previous) {
      const old = await this.library.get(owner, input.previous);
      if (
        old.kind !== 'component' ||
        !('schemaVersion' in old.manifest) ||
        old.engine !== input.manifest.engine
      )
        throw new ValidationError('Selecciona una versión generada del mismo motor.');
      const [latest] = await this.database
        .select({ version: studioLibraries.version })
        .from(studioLibraries)
        .where(and(eq(studioLibraries.ownerId, owner), eq(studioLibraries.id, old.id)))
        .orderBy(desc(studioLibraries.version))
        .limit(1);
      if (latest?.version !== old.version) throw new LibraryConflictError();
      ref = { id: old.id, version: old.version + 1 };
    }
    return {
      ...ref,
      kind: 'component',
      name: input.name ?? 'Componente generado',
      engine: input.manifest.engine,
      assetIds: input.manifest.assetIds,
      manifest: input.manifest,
    };
  }
  private async snapshot(
    owner: string,
    base: ProjectRecord,
    input: ProposalInput,
    candidate: Row['candidate'],
    hash: Row['bundleHash'],
    signal?: AbortSignal,
    database: Pick<Database, 'select' | 'insert' | 'transaction'> = this.database
  ) {
    const ref = candidate ? { id: candidate.id, version: candidate.version } : undefined;
    const document = candidateDocument(base, input, ref);
    const key = candidate && libraryKey(candidate);
    const bytes = hash ? await this.bundles.read(owner, hash) : undefined;
    if (candidate && 'schemaVersion' in candidate.manifest) {
      if (!bytes || !hash) throw new ValidationError('Falta el módulo sellado.');
      const sealed = verifyModule(bytes, candidate.manifest, hash);
      if (input.kind !== 'component' || sealed.sourceHash !== componentSourceHash(input))
        throw new ValidationError('Las fuentes no coinciden con el módulo revisado.');
    }
    const library = new LibraryService(database, this.dir);
    const build = snapshotBuilder(new AssetService(database, this.dir), {
      get: async (id, r) => (candidate && libraryKey(r) === key ? candidate : library.get(id, r)),
      readBundle: async (id, r) =>
        bytes && libraryKey(r) === key ? bytes : library.readBundle(id, r),
    });
    return build(owner, { ...base, document }, signal);
  }
  async stage(
    owner: string,
    project: string,
    raw: unknown,
    signal?: AbortSignal,
    finalize: (persist: (db: Database) => Promise<StageSummary>) => Promise<StageSummary> = (
      persist
    ) => persist(this.database)
  ) {
    const parsed = ProposalDeliverySchema.safeParse(raw);
    if (!parsed.success)
      throw new ValidationError(
        parsed.error.issues
          .map((i) => i.path.join('.') + ' ' + i.message)
          .join('; ')
          .slice(0, 1000)
      );
    const base = await this.projects.get(owner, project);
    const delivery = parsed.data;
    if (base.revision !== delivery.baseRevision) throw new ConflictError(base);
    const declaredEngine =
      delivery.kind === 'component' ? delivery.manifest.engine : delivery.engine;
    const engine = delivery.engine ?? declaredEngine;
    if (
      base.importContext?.mode === 'original' ||
      (delivery.engine && delivery.engine !== base.document.engine) ||
      ((declaredEngine === 'remotion' || declaredEngine === 'hyperframes') &&
        declaredEngine !== base.document.engine)
    )
      throw new ValidationError('Selecciona un proyecto editable del mismo motor.');
    const input: ProposalDelivery =
      delivery.kind === 'component'
        ? {
            ...delivery,
            engine:
              engine === 'remotion' || engine === 'hyperframes' ? engine : base.document.engine,
          }
        : delivery;
    const sourceDigest = inputHash(input),
      identity = and(
        eq(studioProposals.ownerId, owner),
        eq(studioProposals.projectId, project),
        eq(studioProposals.baseRevision, base.revision),
        eq(studioProposals.requestId, input.requestId),
        eq(studioProposals.sourceDigest, sourceDigest)
      );
    const lookup = async (db: Database = this.database) =>
      (await db.select().from(studioProposals).where(identity))[0];
    const summary = (r: Row) => ({
      proposalId: r.id,
      diagnostics: r.diagnostics,
      ...(r.status !== 'invalid' && {
        previewUrl: '/api/studio/projects/' + project + '/proposals/' + r.id + '/preview',
      }),
    });
    const existing = await lookup();
    if (existing && existing.status !== 'invalid') return finalize(async () => summary(existing));
    const validated = ProposalInputSchema.safeParse(input);
    if (!validated.success) {
      if (existing) return finalize(async () => summary(existing));
      const diagnostics: Diagnostic[] = validated.error.issues.slice(0, 8).map((issue) => ({
        severity: 'error',
        code: 'proposal-invalid',
        message: (issue.path.join('.') + ' ' + issue.message).slice(0, 500),
      }));
      return finalize(async (db) => {
        const [row] = await db
          .insert(studioProposals)
          .values({
            id: randomUUID(),
            ownerId: owner,
            projectId: project,
            requestId: input.requestId,
            baseRevision: base.revision,
            input,
            sourceDigest,
            diagnostics,
            status: 'invalid',
          })
          .onConflictDoNothing()
          .returning();
        return summary(row ?? (await lookup(db))!);
      });
    }
    const proposal = validated.data;
    const id = existing?.id ?? randomUUID(),
      candidate = existing
        ? existing.candidate
        : proposal.kind === 'component'
          ? await this.candidate(owner, proposal)
          : null;
    let diagnostics: Diagnostic[] = [],
      bundleHash: string | null = null,
      moduleHash: string | null = null;
    const samples: NonNullable<Row['samples']> = [];
    try {
      if (proposal.kind === 'component') {
        const sealed = await this.compile(
          owner,
          project,
          id,
          { files: proposal.files, manifest: proposal.manifest },
          signal
        );
        const bytes = Buffer.from(JSON.stringify(sealed));
        bundleHash = digest(bytes);
        verifyModule(bytes, proposal.manifest, bundleHash);
        await this.bundles.store(owner, bundleHash, bytes);
        moduleHash = sealed.moduleHash;
      }
      const snapshot = await this.snapshot(owner, base, proposal, candidate, bundleHash, signal);
      diagnostics = validateSnapshot(snapshot);
      if (!diagnostics.some((d) => d.severity === 'error')) {
        const checked = await this.check(
          owner,
          project,
          id,
          snapshot,
          signal,
          changedReviewLayers(base.document, snapshot.document)
        );
        diagnostics.push(...checked.diagnostics);
        if (checked.moduleHashes && moduleHash && !checked.moduleHashes.includes(moduleHash))
          throw new ValidationError('La vista no cargó el módulo revisado.');
        for (const capture of checked.samples ?? []) {
          const bytes = Buffer.from(capture.base64, 'base64');
          if (digest(bytes) !== capture.sha256) throw new ValidationError('Captura no válida.');
          await this.bundles.store(owner, capture.sha256, bytes);
          samples.push({ frame: capture.frame, sha256: capture.sha256 });
        }
      }
    } catch (e) {
      signal?.throwIfAborted();
      diagnostics.push({
        severity: 'error',
        code: 'proposal-invalid',
        message:
          e instanceof ValidationError || e instanceof RangeError
            ? e.message
            : 'No se pudo validar el componente.',
      });
    }
    return finalize(async (db) => {
      if (existing) {
        await db
          .update(studioProposals)
          .set({
            bundleHash,
            moduleHash,
            samples,
            diagnostics,
            status: diagnostics.some((d) => d.severity === 'error') ? 'invalid' : 'ready',
          })
          .where(and(where(owner, project, id), eq(studioProposals.status, 'invalid')));
        return summary((await lookup(db))!);
      }
      const [row] = await db
        .insert(studioProposals)
        .values({
          id,
          ownerId: owner,
          projectId: project,
          requestId: input.requestId,
          baseRevision: base.revision,
          input,
          candidate,
          sourceDigest,
          bundleHash,
          moduleHash,
          samples,
          diagnostics,
          status: diagnostics.some((d) => d.severity === 'error') ? 'invalid' : 'ready',
        })
        .onConflictDoNothing()
        .returning();
      return summary(row ?? (await lookup(db))!);
    });
  }
  async preview(
    owner: string,
    project: string,
    id: string,
    instance: string,
    signal?: AbortSignal
  ) {
    const row = await this.get(owner, project, id);
    if (row.status === 'invalid' || !z.uuidv4().safeParse(instance).success)
      throw new ValidationError('La propuesta requiere correcciones.');
    const base = await revisionForProject(this.database, project, row.baseRevision);
    if (!base) throw new ProjectNotFoundError();
    const snapshot = await this.snapshot(
      owner,
      toRecord(owner, base),
      ProposalInputSchema.parse(row.input),
      row.candidate,
      row.bundleHash,
      signal
    );
    return previewCandidate(snapshot, instance as ReturnType<typeof randomUUID>, signal);
  }
  async apply(owner: string, project: string, id: string, baseRevision: string) {
    return this.database.transaction(
      async (tx) => {
        const [row] = await tx
          .select()
          .from(studioProposals)
          .where(where(owner, project, id))
          .for('update');
        if (!row) throw new ProjectNotFoundError();
        if (baseRevision !== row.baseRevision)
          throw new ConflictError(toRecord(owner, await currentRevision(tx, owner, project)));
        if (row.appliedRevision) {
          const applied = await revisionForProject(tx, project, row.appliedRevision);
          if (applied) return toRecord(owner, applied);
        }
        if (row.status !== 'ready' || inputHash(row.input) !== row.sourceDigest)
          throw new ValidationError('La propuesta requiere validación.');
        const base = await readBaseRevision(tx, owner, project, baseRevision);
        const snap = await this.snapshot(
          owner,
          toRecord(owner, base),
          ProposalInputSchema.parse(row.input),
          row.candidate,
          row.bundleHash,
          undefined,
          tx
        );
        const error = validateSnapshot(snap).find((d) => d.severity === 'error');
        if (error) throw new ValidationError(error.message);
        if (row.candidate) {
          const entry = row.candidate;
          const [inserted] = await tx
            .insert(studioLibraries)
            .values({
              ownerId: owner,
              id: entry.id,
              version: entry.version,
              kind: 'component',
              entry,
              bundleHash: row.bundleHash,
              listed: false,
            })
            .onConflictDoNothing()
            .returning({ id: studioLibraries.id });
          if (!inserted) throw new LibraryConflictError();
        }
        const result = await advanceRevision(
          tx,
          owner,
          base,
          snap.document,
          'save',
          base.importContext
        );
        await tx
          .update(studioProposals)
          .set({ appliedRevision: result.revision, status: 'applied' })
          .where(where(owner, project, id));
        await tx
          .update(studioRequests)
          .set({ resultRevision: result.revision })
          .where(
            and(
              eq(studioRequests.id, row.requestId),
              eq(studioRequests.ownerId, owner),
              eq(studioRequests.projectId, project),
              eq(studioRequests.proposalId, row.id)
            )
          );
        return result;
      },
      { isolationLevel: 'read committed' }
    );
  }
  async sample(owner: string, project: string, id: string, frame: number) {
    const row = await this.get(owner, project, id),
      sample = row.samples?.find((s) => s.frame === frame);
    if (!sample) throw new ProjectNotFoundError('Captura no encontrada.');
    return new Response(new Uint8Array(await this.bundles.read(owner, sample.sha256)), {
      headers: { 'Content-Type': 'image/png' },
    });
  }
  async listVersion(owner: string, project: string, id: string) {
    const row = await this.get(owner, project, id),
      entry = row.candidate;
    if (!entry || !row.appliedRevision)
      throw new ValidationError('Aplica esta versión antes de guardarla en biblioteca.');
    await this.database
      .update(studioLibraries)
      .set({ listed: true })
      .where(
        and(
          eq(studioLibraries.ownerId, owner),
          eq(studioLibraries.id, entry.id),
          eq(studioLibraries.version, entry.version)
        )
      );
    return entry;
  }
}
