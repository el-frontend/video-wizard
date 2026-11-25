import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ImportKindSchema, importDiagnostics, type ImportContext } from '@workspace/video-project';
import type { db } from '@/server/db';
import { ValidationError } from '@/server/lib/utils';
import { editedClipCues } from '@/features/studio-shorts/lib/timing';
import { ASPECT_RATIO_CONFIG } from '@/features/video/lib/aspect-ratios';
import { LibraryService } from './library-service';
import { AssetService } from './asset-service';
import { registeredSources, sourceIdSchema, type MotionSource } from './import-registry';
import { prepareMotion } from './motion-import';
import { ProjectNotFoundError, ProjectService } from './project-service';
import { completedCrop } from './short-provenance';

const inputSchema = z.strictObject({ kind: ImportKindSchema, sourceId: sourceIdSchema });
export class ImportService {
  constructor(
    private readonly database: typeof db,
    private readonly options: { sources?: MotionSource[]; dataDir?: string } = {}
  ) {}
  async import(owner: string, data: unknown) {
    const input = inputSchema.safeParse(data);
    if (!input.success) throw new ValidationError('Selecciona una fuente registrada.');
    const { kind, sourceId } = input.data;
    const assets = new AssetService(this.database, this.options.dataDir),
      projects = new ProjectService(this.database, this.options.dataDir);
    let prepared;
    if (kind === 'motion-studio') {
      const source = (this.options.sources ?? (await registeredSources())).find(
        (row) => row.ownerId === owner && row.sourceId === sourceId
      );
      if (!source) throw new ProjectNotFoundError('Fuente no encontrada.');
      prepared = await prepareMotion(owner, source, assets, new LibraryService(this.database));
    } else {
      const [{ jobHistoryService }, { editorMedia, storedRenderInput }, { shorts }] =
        await Promise.all([
          import('../job-history-service'),
          import('../owned-media-service'),
          import('./shorts'),
        ]);
      const job = await jobHistoryService.getById(sourceId, owner);
      if (!job) throw new ProjectNotFoundError('Trabajo no encontrado.');
      const media = await editorMedia(owner, sourceId),
        asset = await assets.get(owner, media.sourceAssetId);
      const crop = completedCrop(job);
      const refs = [asset, ...(crop ? [await assets.get(owner, crop.sourceAssetId)] : [])];
      const missing = [];
      for (const ref of new Map(refs.map((a) => [a.id, a])).values()) {
        if ((await assets.verify(owner, [ref.id])).length) missing.push(ref);
      }
      const captions = editedClipCues(media.subtitles, media.sourceDurationMs);
      const render =
        job.type === 'render' ? storedRenderInput.safeParse(job.inputData).data : undefined;
      const dimensions = render ? ASPECT_RATIO_CONFIG[render.aspectRatio] : asset;
      const settings = {
        engine: 'remotion',
        canvas: { width: dimensions.width ?? 1080, height: dimensions.height ?? 1920, fps: 30 },
      };
      const document = crop
        ? await shorts.prepareJob(owner, { ...settings, jobId: sourceId, clipCaptions: captions })
        : (
            await shorts.prepareBatch(owner, {
              ...settings,
              assetId: asset.id,
              ranges: [{ startMs: 0, endMs: media.sourceDurationMs }],
              sourceCaptions: captions,
            })
          )[0]!;
      const hash = createHash('sha256')
        .update(
          JSON.stringify([
            1,
            media,
            crop,
            refs.map((a) => [a.id, a.hash]),
            render ?? null,
            ...(missing.length ? [missing.map((a) => a.id)] : []),
          ])
        )
        .digest('hex');
      const context: ImportContext = {
        version: 1,
        kind,
        sourceId,
        hash,
        mode: 'editable',
        slots: missing.map((asset) => ({
          id: randomUUID(),
          kind: 'video',
          assetId: asset.id,
          startMs: 0,
          resolution: 'pending',
          label:
            'Vuelve a subir el archivo original «' +
            asset.name +
            '» en Recursos para recuperar el video.',
        })),
        diagnostics: [],
      };
      if (render) {
        const library = new LibraryService(this.database);
        const caption = document.scenes[0]?.layers.find((l) => l.type === 'captions');
        if (caption) {
          const candidates = await library.list(owner, { engine: 'remotion', kind: 'component' });
          for (const e of candidates) {
            if (
              e.kind === 'component' &&
              e.id === render.template &&
              e.manifest.builtin?.kind === 'remotion-caption' &&
              e.manifest.builtin.preset === render.template &&
              (await library.verifiedComponent(owner, e))
            ) {
              caption.templateRef = { id: e.id, version: e.version };
              break;
            }
          }
          if (!caption.templateRef)
            context.diagnostics.push({
              severity: 'warning',
              code: 'legacy-caption-style',
              message: 'Revisa la plantilla de subtítulos de la edición anterior.',
            });
        }
        if (render.brandKit)
          context.diagnostics.push({
            severity: 'warning',
            code: 'legacy-brand',
            message:
              'Selecciona la marca del proyecto para recrear el tratamiento del editor anterior.',
          });
      }
      prepared = { document, context };
    }
    const project = await projects.importDocument(owner, prepared.document, prepared.context);
    return { project, diagnostics: importDiagnostics(project.importContext) };
  }
}
