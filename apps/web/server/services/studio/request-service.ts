import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AssetDescriptorSchema,
  AssistantProviderSchema,
  CompanionRequestInputSchema,
  ProposalDeliverySchema,
  type CompanionRequest,
} from '@workspace/video-project';
import type { db } from '@/server/db';
import {
  studioRequests as requests,
  studioPairings as intents,
  studioBindings as bindings,
} from '@/server/db/schema';
import { ValidationError } from '@/server/lib/utils';
import { AssetService } from './asset-service';
import { AudioService } from './audio-service';
import {
  ProjectService,
  ProjectNotFoundError,
  readBaseRevision,
  revisionForProject,
  toRecord,
} from './project-service';
import { ProposalService } from './proposal-service';
import { measuredVideo, validateShortRanges } from './short-service';

type Database = typeof db;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Row = typeof requests.$inferSelect;
type Binding = typeof bindings.$inferSelect;
export class CapabilityError extends Error {}
export class RequestCollision extends Error {}
const minute = 60_000;
const lifetime = (minutes: number) => new Date(Date.now() + minutes * minute);
const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');
const mint = (purpose: string) => 'vw_' + purpose + '_' + randomBytes(32).toString('base64url');
const terminal = (r: Row) => ['failed', 'completed', 'cancelled'].includes(r.status);
function invalid(message: string): never {
  throw new ValidationError(message);
}
function deny(): never {
  throw new CapabilityError('La credencial no autoriza esta operación.');
}
function collision(): never {
  throw new RequestCollision('Ya existe otra entrega para esta solicitud.');
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    invalid('Datos de solicitud no válidos. ' + result.error.issues[0]?.path.join('.'));
  return result.data;
}
function fingerprint(value: unknown) {
  return hash(
    JSON.stringify(value, (_key, v) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : v
    )
  );
}
const noteSchema = z
  .string()
  .max(500)
  .refine((v) => !/(?:https?:\/\/|vw_(?:pair|dispatch|attempt)_|Bearer\s)/i.test(v))
  .optional();
const reportSchema = z.strictObject({
  status: z.enum(['running', 'completed', 'failed', 'waiting', 'delivery-unknown', 'cancelled']),
  note: noteSchema,
  resultRevision: z.uuid().optional(),
});
const ackSchema = z.strictObject({
  deliveryId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,120}$/)
    .optional(),
  status: z.enum(['sent', 'waiting', 'delivery-unknown', 'failed']),
  note: noteSchema,
});
function receipt(row: Row): CompanionRequest {
  const { sourceCaptions: _captions, ...context } = row.payload;
  return {
    ...context,
    ...(row.voice && { voice: row.voice }),
    ...(row.delivery && { delivery: row.delivery }),
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    ...(row.note && { note: row.note }),
    ...(row.resultRevision && { resultRevision: row.resultRevision }),
    ...(row.assetId && { assetId: row.assetId }),
    ...(row.proposalId && { proposalId: row.proposalId }),
    ...(row.ranges && { ranges: row.ranges }),
  };
}
const bound = (owner: string, project: string, binding: string) =>
  and(
    eq(bindings.ownerId, owner),
    eq(bindings.projectId, project),
    eq(bindings.bindingId, binding)
  );
const scoped = (b: Binding) =>
  and(
    eq(requests.ownerId, b.ownerId),
    eq(requests.projectId, b.projectId),
    eq(requests.bindingId, b.bindingId)
  );
function active(row: Row) {
  if (terminal(row)) deny();
}
async function change(tx: Tx, row: Row, patch: Partial<typeof requests.$inferInsert>) {
  const [saved] = await tx.update(requests).set(patch).where(eq(requests.id, row.id)).returning();
  return receipt(saved);
}
export class RequestService {
  constructor(
    private readonly database: Database,
    private readonly dir?: string
  ) {}
  async pairing(owner: string, project: string) {
    await new ProjectService(this.database).get(owner, project);
    const token = mint('pair'),
      expires = lifetime(5);
    await this.database
      .insert(intents)
      .values({ digest: hash(token), ownerId: owner, projectId: project, expires });
    return { token, projectId: project, expires: expires.toISOString() };
  }
  async bind(secret: string, raw: unknown) {
    const { bindingId, provider } = parse(
      z.strictObject({ bindingId: z.uuid(), provider: AssistantProviderSchema }),
      raw
    );
    return this.database.transaction(async (tx) => {
      const [i] = await tx
        .delete(intents)
        .where(and(eq(intents.digest, hash(secret)), gt(intents.expires, new Date())))
        .returning();
      if (!i) deny();
      const token = mint('dispatch'),
        expires = lifetime(60 * 24 * 30);
      const existing = (
        await tx
          .select()
          .from(bindings)
          .where(bound(i.ownerId, i.projectId, bindingId))
          .for('update')
      )[0];
      if (existing && existing.provider !== provider) deny();
      if (existing)
        await tx.update(requests).set({ attemptExpires: new Date() }).where(scoped(existing));
      await tx
        .insert(bindings)
        .values({
          bindingId,
          provider,
          ownerId: i.ownerId,
          projectId: i.projectId,
          digest: hash(token),
          expires,
        })
        .onConflictDoUpdate({
          target: [bindings.ownerId, bindings.projectId, bindings.bindingId],
          set: { digest: hash(token), expires },
        });
      return { token, bindingId, projectId: i.projectId, provider };
    });
  }
  async bindings(owner: string, project: string) {
    await new ProjectService(this.database).get(owner, project);
    return this.database
      .select({ bindingId: bindings.bindingId, provider: bindings.provider })
      .from(bindings)
      .where(
        and(
          eq(bindings.ownerId, owner),
          eq(bindings.projectId, project),
          gt(bindings.expires, new Date())
        )
      );
  }
  async revoke(owner: string, project: string, binding: string) {
    await this.database
      .update(bindings)
      .set({ expires: new Date() })
      .where(bound(owner, project, parse(z.uuid(), binding)));
  }
  async create(owner: string, project: string, raw: unknown) {
    const input = parse(CompanionRequestInputSchema, raw);
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([owner, project, input.idempotencyKey])},0))`
      );
      const [old] = await tx
        .select()
        .from(requests)
        .where(
          and(
            eq(requests.ownerId, owner),
            eq(requests.projectId, project),
            eq(requests.idempotencyKey, input.idempotencyKey)
          )
        );
      if (old) {
        if (!isDeepStrictEqual(old.payload, input)) collision();
        return receipt(old);
      }
      const base = await readBaseRevision(tx, owner, project, input.baseRevision);
      const [binding] = await tx
        .select()
        .from(bindings)
        .where(
          and(
            bound(owner, project, input.bindingId),
            eq(bindings.provider, input.provider),
            gt(bindings.expires, new Date())
          )
        );
      if (!binding) throw new ProjectNotFoundError('Vínculo no disponible.');
      const s = input.selection,
        scene = base.document.scenes.find((a) => a.id === s.sceneId),
        layer = (scene?.layers ?? base.document.globalAudio).find((l) => l.id === s.layerId);
      if (
        input.engine !== base.engine ||
        base.importContext?.mode === 'original' ||
        s.timeMs > base.document.durationMs ||
        (s.sceneId && !scene) ||
        (s.layerId && !layer) ||
        (s.captionId &&
          !(layer?.type === 'captions' && layer.cues.some((c) => c.id === s.captionId)))
      )
        invalid('La selección no coincide con la revisión.');
      if (
        input.kind === 'voice' &&
        (!scene || layer?.type !== 'audio' || base.importContext?.narration?.playback === 'master')
      )
        invalid('Activa las tomas y selecciona una capa de audio de escena.');
      if (input.kind === 'shorts') {
        if (!input.sourceAssetId) invalid('Selecciona el video de origen.');
        const duration = measuredVideo(
          await new AssetService(tx, this.dir).get(owner, input.sourceAssetId)
        );
        if (input.sourceCaptions?.some((c) => c.endMs > duration))
          invalid('Los subtítulos exceden la duración de la fuente.');
      } else if (input.sourceAssetId || input.sourceCaptions)
        invalid('El recurso de origen corresponde a Shorts.');
      const [r] = await tx
        .insert(requests)
        .values({
          id: randomUUID(),
          ownerId: owner,
          projectId: project,
          bindingId: binding.bindingId,
          idempotencyKey: input.idempotencyKey,
          payload: input,
          status: 'created',
        })
        .returning();
      return receipt(r);
    });
  }
  async list(owner: string, project: string) {
    await new ProjectService(this.database).get(owner, project);
    await this.database
      .update(requests)
      .set({
        status: 'delivery-unknown',
        note: 'El despacho quedó sin confirmar. Revisa la conversación.',
      })
      .where(
        and(
          eq(requests.ownerId, owner),
          eq(requests.projectId, project),
          eq(requests.status, 'sending'),
          lt(requests.claimedAt, new Date(Date.now() - 10 * minute))
        )
      );
    return (
      await this.database
        .select()
        .from(requests)
        .where(and(eq(requests.ownerId, owner), eq(requests.projectId, project)))
        .orderBy(desc(requests.createdAt))
    ).map(receipt);
  }
  private async dispatcher(tx: Tx, secret: string, project: string, id: string) {
    if (!z.uuid().safeParse(project).success || !z.uuid().safeParse(id).success) deny();
    const [b] = await tx
      .select()
      .from(bindings)
      .where(
        and(
          eq(bindings.digest, hash(secret)),
          eq(bindings.projectId, project),
          eq(bindings.bindingId, id),
          gt(bindings.expires, new Date())
        )
      )
      .for('share');
    if (!b) deny();
    return b;
  }
  async claim(secret: string, project: string, binding: string, id?: string) {
    return this.database.transaction(async (tx) => {
      const b = await this.dispatcher(tx, secret, project, binding);
      const [r] = await tx
        .select()
        .from(requests)
        .where(
          and(
            scoped(b),
            eq(requests.status, 'created'),
            id ? eq(requests.id, parse(z.uuid(), id)) : undefined
          )
        )
        .orderBy(asc(requests.createdAt))
        .limit(1)
        .for('update', { skipLocked: true });
      if (!r) return null;
      const token = mint('attempt'),
        attemptId = randomUUID();
      const request = await change(tx, r, {
        status: 'sending',
        attemptId,
        attemptDigest: hash(token),
        claimedAt: new Date(),
        attemptExpires: lifetime(24 * 60),
      });
      return { request, attemptId, token };
    });
  }
  async ack(
    secret: string,
    project: string,
    binding: string,
    id: string,
    attempt: string,
    raw: unknown
  ) {
    const a = parse(ackSchema, raw);
    return this.database.transaction(async (tx) => {
      const b = await this.dispatcher(tx, secret, project, binding);
      const [r] = await tx
        .select()
        .from(requests)
        .where(
          and(
            scoped(b),
            eq(requests.id, parse(z.uuid(), id)),
            eq(requests.attemptId, parse(z.uuid(), attempt))
          )
        )
        .for('update');
      if (!r) deny();
      if (r.delivery) return receipt(r);
      const delivery = { status: a.status, ...(a.deliveryId && { id: a.deliveryId }) };
      return change(tx, r, {
        delivery,
        ...(r.status === 'sending' && { status: a.status, note: a.note ?? null }),
      });
    });
  }
  private async authorized<T>(
    secret: string,
    project: string | undefined,
    kinds: CompanionRequest['kind'][] | null,
    fn: (tx: Tx, row: Row) => Promise<T>,
    request?: string
  ) {
    return this.database.transaction(async (tx) => {
      const [r] = await tx
        .select()
        .from(requests)
        .where(
          and(eq(requests.attemptDigest, hash(secret)), gt(requests.attemptExpires, new Date()))
        )
        .for('update');
      if (
        !r ||
        (project !== undefined && r.projectId !== project) ||
        (request !== undefined && r.id !== request) ||
        (kinds && !kinds.includes(r.payload.kind))
      )
        deny();
      const [b] = await tx
        .select()
        .from(bindings)
        .where(and(bound(r.ownerId, r.projectId, r.bindingId), gt(bindings.expires, new Date())));
      if (!b) deny();
      return fn(tx, r);
    });
  }
  async verifyAttempt(
    secret: string,
    project: string | undefined,
    kinds: CompanionRequest['kind'][] | null,
    id?: string
  ) {
    await this.authorized(secret, project, kinds, async () => undefined, id);
  }
  async verifyDispatcher(secret: string, project: string, binding: string) {
    await this.database.transaction(async (tx) => {
      await this.dispatcher(tx, secret, project, binding);
    });
  }
  async verifyPairing(secret: string) {
    if (
      !(
        await this.database
          .select()
          .from(intents)
          .where(and(eq(intents.digest, hash(secret)), gt(intents.expires, new Date())))
      ).length
    )
      deny();
  }
  read(secret: string, project: string) {
    return this.authorized(secret, project, null, async (tx, r) =>
      new ProjectService(tx).get(r.ownerId, r.projectId)
    );
  }
  async assertHumanDelivery(raw: unknown) {
    const input = parse(ProposalDeliverySchema, raw);
    if (
      (
        await this.database
          .select({ id: requests.id })
          .from(requests)
          .where(eq(requests.id, input.requestId))
      ).length
    )
      deny();
    return input;
  }
  private async saved(tx: Tx, r: Row, digest: string) {
    if (!r.resultRevision) return;
    if (r.actionDigest !== digest) collision();
    const snapshot = await revisionForProject(tx, r.projectId, r.resultRevision);
    if (!snapshot) throw new ProjectNotFoundError();
    return toRecord(r.ownerId, snapshot);
  }
  feedback(secret: string, project: string, raw: unknown) {
    return this.authorized(secret, project, ['feedback'], async (tx, r) => {
      const action = parse(
        z.strictObject({ baseRevision: z.uuid(), text: z.string().trim().min(1).max(12000) }),
        raw
      );
      const digest = fingerprint(action),
        old = await this.saved(tx, r, digest);
      if (old) return old;
      active(r);
      if (r.payload.baseRevision !== action.baseRevision) deny();
      const base = await readBaseRevision(tx, r.ownerId, project, action.baseRevision),
        doc = structuredClone(base.document),
        s = r.payload.selection;
      const scene = doc.scenes.find((a) => a.id === s.sceneId);
      if (s.layerId) {
        const layer = scene?.layers.find((l) => l.id === s.layerId);
        if (layer?.type === 'text' && !s.captionId) {
          if (scene?.editorial?.headline === layer.text) scene.editorial.headline = action.text;
          layer.text = action.text;
        } else if (layer?.type === 'captions' && s.captionId) {
          const cue = layer.cues.find((c) => c.id === s.captionId);
          if (!cue) deny();
          cue.text = action.text;
          delete cue.words;
        } else invalid('Selecciona un titular o subtítulo.');
      } else if (scene) {
        scene.editorial = { ...scene.editorial, headline: action.text };
      } else doc.title = action.text;
      const result = await new ProjectService(tx, this.dir).save(r.ownerId, project, {
        baseRevision: action.baseRevision,
        document: doc,
      });
      await change(tx, r, { resultRevision: result.revision, actionDigest: digest });
      return result;
    });
  }
  async stage(secret: string, project: string, raw: unknown, signal?: AbortSignal) {
    const input = parse(ProposalDeliverySchema, raw),
      digest = fingerprint(input),
      kinds = ['component', 'storyboard'] as const;
    const reservation = await this.authorized(
      secret,
      project,
      [...kinds],
      async (tx, r) => {
        if (
          input.requestId !== r.id ||
          input.kind !== r.payload.kind ||
          input.baseRevision !== r.payload.baseRevision
        )
          deny();
        if (r.proposalId) {
          const p = await new ProposalService(tx, this.dir).get(r.ownerId, project, r.proposalId);
          if (p.status !== 'invalid' || terminal(r)) {
            if (r.actionDigest !== digest) collision();
            return {
              owner: r.ownerId,
              cached: {
                proposalId: p.id,
                diagnostics: p.diagnostics,
                ...(p.status !== 'invalid' && {
                  previewUrl: '/api/studio/projects/' + project + '/proposals/' + p.id + '/preview',
                }),
              },
            };
          }
        } else if (r.actionDigest && r.actionDigest !== digest) collision();
        active(r);
        await change(tx, r, { actionDigest: digest });
        return { owner: r.ownerId, cached: null };
      },
      input.requestId
    );
    if (reservation.cached) return reservation.cached;
    // Compile and sample outside a database transaction. Only publication of the result is fenced.
    return new ProposalService(this.database, this.dir).stage(
      reservation.owner,
      project,
      input,
      signal,
      (persist) =>
        this.authorized(
          secret,
          project,
          [...kinds],
          async (tx, r) => {
            if (r.actionDigest !== digest) collision();
            active(r);
            await readBaseRevision(tx, r.ownerId, project, input.baseRevision);
            const result = await persist(tx);
            await change(tx, r, { proposalId: result.proposalId });
            return result;
          },
          input.requestId
        )
    );
  }
  beginVoice(secret: string, project: string, id: string) {
    return this.authorized(
      secret,
      project,
      ['voice'],
      async (tx, r) => {
        active(r);
        if (r.generationStarted || r.assetId)
          throw new RequestCollision(
            'La generación ya se inició. Comprueba el archivo antes de continuar.'
          );
        await readBaseRevision(tx, r.ownerId, project, r.payload.baseRevision);
        return change(tx, r, {
          generationStarted: new Date(),
          status: 'running',
          note: 'Generación iniciada. Pendiente del archivo medido.',
        });
      },
      id
    );
  }
  async upload(secret: string, input: Parameters<AssetService['ingest']>[1]) {
    const owner = await this.authorized(secret, undefined, ['voice'], async (_tx, r) => {
      if (!r.assetId) active(r);
      if (!input.mediaType.startsWith('audio/')) invalid('Envía un archivo de audio.');
      return r.ownerId;
    });
    // Stream and probe first. Register the measured asset and its origin in one short transaction.
    const uploaded = await new AssetService(this.database, this.dir).ingest(
      owner,
      input,
      (register) =>
        this.authorized(secret, undefined, ['voice'], async (tx, r) => {
          if (!r.assetId) active(r);
          const asset = await register(tx);
          if (!asset.hasAudio || !asset.durationMs) invalid('No se pudo medir una toma de voz.');
          if (r.assetId && r.assetId !== asset.id) collision();
          if (!r.assetId) await change(tx, r, { assetId: asset.id });
          return asset;
        })
    );
    return AssetDescriptorSchema.strip().parse(uploaded);
  }
  audio(secret: string, project: string, raw: unknown) {
    return this.authorized(secret, project, ['voice'], async (tx, r) => {
      const input = parse(
        z.strictObject({
          baseRevision: z.uuid(),
          sceneId: z.string(),
          audioLayerId: z.string(),
          assetId: z.uuid(),
          captions: z.array(z.unknown()).min(1),
          captionSource: z.enum(['provider-alignment', 'transcription']),
          provider: z.enum(['ElevenLabs', 'upload']),
          spokenText: z.string().min(1).max(12000),
        }),
        raw
      );
      const { captionSource, provider, spokenText, ...body } = input;
      if (
        body.baseRevision !== r.payload.baseRevision ||
        body.sceneId !== r.payload.selection.sceneId ||
        body.audioLayerId !== r.payload.selection.layerId ||
        body.assetId !== r.assetId ||
        (provider !== 'upload' && !r.generationStarted)
      )
        deny();
      const digest = fingerprint(input),
        old = await this.saved(tx, r, digest);
      if (old) return old;
      active(r);
      const audio = new AudioService(
        new ProjectService(tx, this.dir),
        new AssetService(tx, this.dir)
      );
      const result = await audio.replace(r.ownerId, project, body, { provider, spokenText });
      const asset = await new AssetService(tx, this.dir).get(r.ownerId, body.assetId);
      await change(tx, r, {
        resultRevision: result.revision,
        actionDigest: digest,
        voice: { provider, captionSource, durationMs: asset.durationMs! },
      });
      return result;
    });
  }
  source(secret: string, project: string, id: string) {
    return this.authorized(
      secret,
      project,
      ['shorts'],
      async (tx, r) => ({
        asset: AssetDescriptorSchema.strip().parse(
          await new AssetService(tx, this.dir).get(r.ownerId, r.payload.sourceAssetId!)
        ),
        captions: r.payload.sourceCaptions ?? [],
      }),
      id
    );
  }
  suggestions(secret: string, project: string, id: string, raw: unknown) {
    return this.authorized(
      secret,
      project,
      ['shorts'],
      async (tx, r) => {
        const ranges = parse(
          z
            .array(z.strictObject({ startMs: z.int().nonnegative(), endMs: z.int().positive() }))
            .min(1)
            .max(100),
          raw
        );
        if (r.ranges) {
          if (!isDeepStrictEqual(r.ranges, ranges)) collision();
          return receipt(r);
        }
        active(r);
        const duration = measuredVideo(
          await new AssetService(tx, this.dir).get(r.ownerId, r.payload.sourceAssetId!)
        );
        validateShortRanges(ranges, duration);
        return change(tx, r, { ranges });
      },
      id
    );
  }
  private async transitionRow(tx: Tx, r: Row, raw: unknown) {
    const value = parse(reportSchema, raw);
    if (value.resultRevision && value.resultRevision !== r.resultRevision) deny();
    if (terminal(r)) return receipt(r);
    if (value.status === 'completed' && !(r.resultRevision || r.ranges || r.proposalId))
      invalid('Entrega primero el resultado autorizado.');
    if (
      value.status === 'completed' &&
      r.proposalId &&
      (await new ProposalService(tx, this.dir).get(r.ownerId, r.projectId, r.proposalId)).status ===
        'invalid'
    )
      invalid('La propuesta aún requiere correcciones.');
    return change(tx, r, { status: value.status, note: value.note ?? null });
  }
  report(secret: string, project: string, id: string, raw: unknown) {
    return this.authorized(secret, project, null, (tx, r) => this.transitionRow(tx, r, raw), id);
  }
  transition(owner: string, id: string, raw: unknown) {
    return this.database.transaction(async (tx) => {
      const [r] = await tx
        .select()
        .from(requests)
        .where(and(eq(requests.ownerId, owner), eq(requests.id, parse(z.uuid(), id))))
        .for('update');
      if (!r) throw new ProjectNotFoundError();
      return this.transitionRow(tx, r, raw);
    });
  }
}
