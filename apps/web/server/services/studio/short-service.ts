import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CanvasSchema,
  CaptionInputSchema,
  EngineIdSchema,
  FocalPointSchema,
  IdSchema,
  LibraryRefSchema,
  MillisecondsSchema,
  type PlaybackVariant,
  type AssetRecord,
  type ProjectDraft,
  type ProjectRecord,
} from '@workspace/video-project';
import { sliceCaptions } from '@/features/studio-shorts/lib/timing';
import { captionLayer } from '@/features/studio-designer/lib/editor-commands';
import { fitsShort } from '@/features/studio-shorts/lib/template';
import { ValidationError } from '@/server/lib/utils';
import { completedCrop } from './short-provenance';
import type { jobHistoryService } from '../job-history-service';
import type { AssetService } from './asset-service';
import { ProjectNotFoundError, type ProjectService } from './project-service';
import type { TemplateService } from './template-service';
export { sliceCaptions };

const rangeSchema = z.strictObject({
  startMs: MillisecondsSchema,
  endMs: MillisecondsSchema,
  crop: z
    .strictObject({ fit: z.enum(['cover', 'contain']), focalPoint: FocalPointSchema })
    .optional(),
});
const options = {
  engine: EngineIdSchema,
  canvas: CanvasSchema,
  templateRef: LibraryRefSchema.optional(),
};
const createInput = z.strictObject({
  ...options,
  assetId: IdSchema,
  ranges: z.array(rangeSchema).min(1),
  sourceCaptions: z.array(CaptionInputSchema).default([]),
});
const jobInput = z.strictObject({
  ...options,
  jobId: z.uuid(),
  clipCaptions: z.array(CaptionInputSchema).default([]),
});
function invalid(message: string): never {
  throw new ValidationError(message);
}
export function measuredVideo(asset: AssetRecord) {
  if (!asset.mediaType.startsWith('video/') || !asset.durationMs)
    invalid('Selecciona un video con duración medida.');
  return asset.durationMs;
}

export class ShortService {
  constructor(
    private assets: Pick<AssetService, 'get'>,
    private projects: Pick<ProjectService, 'createFromDocuments'>,
    private templates: Pick<TemplateService, 'prepare'>,
    private jobs: Pick<typeof jobHistoryService, 'getById'>
  ) {}
  async create(owner: string, data: unknown): Promise<ProjectRecord[]> {
    return this.createBatch(owner, data);
  }
  private async createBatch(
    owner: string,
    data: unknown,
    variant?: PlaybackVariant
  ): Promise<ProjectRecord[]> {
    const parsed = createInput.safeParse(data);
    if (!parsed.success)
      invalid('Comprueba los tiempos enteros, las palabras y el formato de los fragmentos.');
    const { assetId, ranges, sourceCaptions, engine, canvas, templateRef } = parsed.data;
    const asset = await this.assets.get(owner, assetId),
      duration = measuredVideo(asset);
    if (ranges.some((r) => r.endMs <= r.startMs || r.endMs > duration))
      invalid('Cada fragmento necesita un inicio y un final dentro del video.');
    if (
      sourceCaptions.some((c) => c.endMs > duration) ||
      new Set(sourceCaptions.map((c) => c.id)).size !== sourceCaptions.length
    )
      invalid('Comprueba los identificadores y tiempos de los subtítulos del video.');
    if (variant) {
      const derived = await this.assets.get(owner, variant.assetId);
      if (
        measuredVideo(derived) < variant.sourceEndMs - variant.sourceStartMs ||
        (asset.hasAudio && !derived.hasAudio)
      )
        invalid('El recorte procesado no cubre el tramo o su audio. Vuelve a generar el clip.');
    }
    const docs: ProjectDraft[] = [];
    for (const range of ranges) {
      const length = range.endMs - range.startMs;
      const doc: ProjectDraft = templateRef
        ? await this.templates.prepare(owner, { templateRef, engine })
        : {
            schemaVersion: 1,
            id: randomUUID(),
            engine,
            canvas,
            title: asset.name,
            durationMs: length,
            scenes: [{ id: randomUUID(), durationMs: length, layers: [] }],
            globalAudio: [],
            assetIds: [],
            styleRef: null,
            brandSnapshot: null,
          };
      if (templateRef && !fitsShort(doc, canvas, [length]))
        invalid(
          'Elige una plantilla sin video propio que admita el lienzo y la duración de cada fragmento.'
        );
      doc.durationMs = length;
      doc.title = asset.name + ' · ' + (docs.length + 1);
      if (!doc.assetIds.includes(assetId)) doc.assetIds.push(assetId);
      if (variant && !doc.assetIds.includes(variant.assetId)) doc.assetIds.push(variant.assetId);
      const scene = doc.scenes[0]!;
      scene.durationMs = length;
      const base = {
        startMs: 0,
        endMs: length,
        endAnchor: 'scene-end' as const,
        visible: true,
        box: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      };
      const back =
        Math.min(0, ...scene.layers.map((l) => l.zIndex)) - (scene.layers.length ? 1 : 0);
      scene.layers.unshift({
        ...base,
        type: 'video',
        id: randomUUID(),
        zIndex: back,
        assetId,
        ...(variant ? { playbackVariant: variant } : {}),
        sourceInMs: range.startMs,
        volume: 1,
        fit: range.crop?.fit ?? 'cover',
        focalPoint: range.crop?.focalPoint ?? { x: 0.5, y: 0.5 },
      });
      const cues = sliceCaptions(sourceCaptions, range).map((c) => ({ ...c, id: randomUUID() }));
      const captions = scene.layers.find((l) => l.type === 'captions');
      if (captions) {
        captions.endMs = length;
        captions.cues = cues;
      } else if (cues.length)
        scene.layers.push({ ...captionLayer(scene, canvas), endAnchor: 'scene-end', cues });
      docs.push(doc);
    }
    return this.projects.createFromDocuments(owner, docs);
  }
  async fromJob(owner: string, data: unknown) {
    const parsed = jobInput.safeParse(data);
    if (!parsed.success) invalid('El trabajo o sus subtítulos no son válidos.');
    const { jobId, clipCaptions, ...settings } = parsed.data;
    const job = await this.jobs.getById(jobId, owner);
    if (!job || job.type !== 'clip_creation')
      throw new ProjectNotFoundError('Trabajo de clip no encontrado.');
    if (job.status !== 'completed') invalid('El clip debe haber terminado de procesarse.');
    const crop = completedCrop(job);
    if (!crop)
      invalid(
        'Este clip no tiene un video de origen registrado. Abre Shorts y carga el archivo original.'
      );
    const { sourceAssetId, variant } = crop;
    const { sourceStartMs: startMs, sourceEndMs: endMs } = variant;
    if (clipCaptions.some((c) => c.endMs > endMs - startMs))
      invalid('Los subtítulos editados deben estar dentro del clip.');
    const sourceCaptions = clipCaptions.map((c) => ({
      ...c,
      startMs: c.startMs + startMs,
      endMs: c.endMs + startMs,
    }));
    const [record] = await this.createBatch(
      owner,
      { assetId: sourceAssetId, ranges: [{ startMs, endMs }], sourceCaptions, ...settings },
      variant
    );
    return record!;
  }
}
