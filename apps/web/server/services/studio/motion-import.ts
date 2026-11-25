import { execFile } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { z } from 'zod';
import { loadStylePack, stylePackFonts, stylePackIds } from '@workspace/style-packs';
import {
  type AssetRecord,
  type ProjectDraft,
  type ImportContext,
  type ImportSlot,
  type Scene,
  JsonObjectSchema,
} from '@workspace/video-project';
import { captionLayer, titleLayer } from '@/features/studio-designer/lib/editor-commands';
import { ValidationError } from '@/server/lib/utils';
import { packagesDirectory } from './catalog-source';
import { masterLengthDiagnostic } from './import-narration';
import { AssetService } from './asset-service';
import { LibraryService } from './library-service';
import type { MotionSource } from './import-registry';

const captureFile = promisify(execFile);
const seconds = z.number().nonnegative();
const dirtyFields = {
  audioDirty: z.boolean().optional(),
  voiceDirty: z.boolean().optional(),
  narrationDirty: z.boolean().optional(),
};
const sourceScene = z
  .object({
    duration: seconds.positive().max(3600),
    headline: z.string().optional(),
    titleLines: z.array(z.string()).optional(),
    narration: z.string().optional(),
    audio: z.string().optional(),
    audioOffset: seconds.default(0),
    voiceDuration: seconds.optional(),
    ...dirtyFields,
  })
  .catchall(z.json());
const model = z.object({
  hash: z.string(),
  revisionStatus: z.enum(['unversioned', 'verified', 'missing-captions']),
  meta: z.object({
    title: z.string().optional(),
    styleId: z.string().optional(),
    audioBindings: z.record(z.string(), z.string()),
  }),
  fonts: z.record(z.string(), z.string().nullable()),
  frame: z.string(),
  styleFrame: z.string().nullable(),
  media: z.record(z.string(), z.string().nullable()),
  episode: z
    .object({
      title: z.string().optional(),
      series: z.string().optional(),
      date: z.string().optional(),
      dateLabel: z.string().optional(),
      audioMaster: z.string().optional(),
      scenes: z.array(sourceScene).min(1).max(100),
      ...dirtyFields,
    })
    .nullable(),
  captions: z
    .array(
      z
        .object({ text: z.string(), start: seconds, end: seconds, words: z.unknown().optional() })
        .refine((c) => c.end > c.start)
    )
    .max(10000)
    .nullable(),
});
const formats: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
};
const ms = (value: number) => Math.round(value * 1000);
function dirty(value: z.infer<typeof sourceScene> | NonNullable<z.infer<typeof model>['episode']>) {
  return value.voiceDirty || value.narrationDirty || value.audioDirty;
}
async function resolveStyle(
  owner: string,
  capture: z.infer<typeof model>,
  library: LibraryService,
  assets: AssetService
) {
  const candidates = await library.list(owner, { kind: 'style', engine: 'hyperframes' });
  for (const id of stylePackIds) {
    const archive = await loadStylePack(
      id,
      join(packagesDirectory(), 'style-packs/packs', id, 'frame.md')
    );
    if (capture.meta.styleId !== id || capture.styleFrame !== archive.frameMarkdown) continue;
    for (const entry of candidates) {
      if (
        entry.kind !== 'style' ||
        entry.id !== id ||
        entry.family?.id !== id ||
        entry.frameMarkdown !== archive.frameMarkdown ||
        !isDeepStrictEqual(entry.tokens, archive.tokens) ||
        !isDeepStrictEqual(entry.exposedRoles, archive.exposedRoles) ||
        entry.fonts?.length !== stylePackFonts.length
      )
        continue;
      let match = true;
      for (const font of stylePackFonts) {
        const binding = entry.fonts.find(
          (f) => f.family === font.family && isDeepStrictEqual(f.weight, font.weight)
        );
        if (!binding) {
          match = false;
          break;
        }
        const expected = createHash('sha256')
          .update(
            await readFile(join(packagesDirectory(), 'style-packs/packs/fonts', font.filename))
          )
          .digest('hex');
        if (
          capture.fonts[font.filename] !== expected ||
          (await assets.get(owner, binding.assetId)).hash !== expected
        ) {
          match = false;
          break;
        }
      }
      if (match) return { id, version: entry.version };
    }
  }
  return null;
}
export async function prepareMotion(
  owner: string,
  source: MotionSource,
  assets: AssetService,
  library: LibraryService
) {
  const stage = await mkdtemp(join(tmpdir(), 'studio-import-'));
  try {
    try {
      await captureFile(
        'python3',
        [
          join(packagesDirectory(), '../apps/web/scripts/capture-motion.py'),
          source.root,
          source.slug,
          stage,
          String(source.fps),
        ],
        { timeout: 120000 }
      );
    } catch {
      throw new ValidationError(
        'No se pudo obtener una captura estable de los archivos registrados.'
      );
    }
    const input = model.safeParse(JSON.parse(await readFile(join(stage, 'model.json'), 'utf8')));
    if (!input.success)
      throw new ValidationError('El modelo de la fuente contiene datos no válidos.');
    const capture = input.data,
      ep = capture.episode;
    const document: ProjectDraft = {
      schemaVersion: 1,
      id: randomUUID(),
      engine: 'hyperframes',
      title: capture.meta.title || ep?.title || ep?.series || source.slug,
      canvas: { width: 1080, height: 1920, fps: source.fps },
      scenes: [],
      durationMs: 0,
      globalAudio: [],
      assetIds: [],
      styleRef: null,
      brandSnapshot: null,
    };
    const context: ImportContext = {
      version: 1,
      kind: 'motion-studio',
      sourceId: source.sourceId,
      hash: capture.hash,
      mode: ep ? 'editable' : 'original',
      slots: [],
      diagnostics: [],
    };
    const pending = (
      kind: ImportSlot['kind'],
      label: string,
      startMs = 0,
      sceneId?: string,
      extra: Pick<ImportSlot, 'inactiveTake' | 'spokenText'> = {}
    ) =>
      context.slots.push({
        id: randomUUID(),
        kind,
        label,
        sceneId,
        startMs,
        resolution: 'pending',
        ...extra,
      });
    const media = new Map<string, AssetRecord>();
    for (const [name, file] of Object.entries(capture.media)) {
      if (!file) continue;
      try {
        const asset = await assets.ingest(owner, {
          filename: basename(name),
          mediaType: formats[extname(name).toLowerCase()]!,
          stream: createReadStream(join(stage, file)),
        });
        media.set(name, asset);
        if (!document.assetIds.includes(asset.id)) document.assetIds.push(asset.id);
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
      }
    }
    if (!ep) {
      context.originalAssetId = media.get('original.mp4')?.id;
      if (!context.originalAssetId) pending('video', 'Falta el archivo de video original.');
      return { document, context };
    }
    if (ep.series !== undefined || ep.dateLabel !== undefined || ep.date !== undefined)
      context.editorial = { series: ep.series, dateLabel: ep.dateLabel, date: ep.date };
    document.styleRef = await resolveStyle(owner, capture, library, assets);
    if (!document.styleRef && (capture.meta.styleId || capture.frame))
      pending('style', 'Selecciona una edición compatible del estilo de origen.');
    if (capture.captions === null)
      pending('captions', 'Falta el archivo de subtítulos del episodio.');
    if (capture.revisionStatus === 'missing-captions')
      context.diagnostics.push({
        code: 'source-revision-incomplete',
        severity: 'warning',
        message:
          'Se recuperaron las escenas. Faltan los subtítulos necesarios para verificar la revisión completa del origen.',
      });
    const changed = (scene: z.infer<typeof sourceScene>) =>
      dirty(scene) ||
      (!!scene.audio &&
        Object.hasOwn(capture.meta.audioBindings, scene.audio) &&
        capture.meta.audioBindings[scene.audio] !== scene.narration);
    const master =
      !dirty(ep) && !ep.scenes.some(changed) && ep.audioMaster
        ? media.get(ep.audioMaster)
        : undefined;
    const useMaster = !!master?.hasAudio && !!master.durationMs;
    context.narration = {
      playback: useMaster ? 'master' : 'scenes',
      masterAssetId: ep.audioMaster ? media.get(ep.audioMaster)?.id : undefined,
      takes: [],
    };
    const masterLayerId = useMaster ? randomUUID() : undefined;
    let secondsElapsed = 0;
    for (const item of ep.scenes) {
      const {
        audio,
        audioOffset,
        titleLines,
        headline: alternate,
        narration,
        duration,
        ...editorial
      } = item;
      const title = titleLines?.join('\n') || alternate;
      const start = ms(secondsElapsed);
      secondsElapsed += duration;
      const end = ms(secondsElapsed),
        durationMs = end - start;
      if (!durationMs || secondsElapsed > 7200)
        throw new ValidationError('La duración del episodio no es válida.');
      const scene: Scene = {
        id: randomUUID(),
        durationMs,
        layers: [],
        editorial: {
          headline: title,
          narration,
          content: JsonObjectSchema.parse(editorial),
        },
      };
      document.scenes.push(scene);
      const headline = titleLayer(scene, document.canvas);
      if (headline.type === 'text' && title) scene.layers.push({ ...headline, text: title });
      const captions = captionLayer(scene, document.canvas);
      const cues = (capture.captions ?? []).flatMap((c) => {
        const a = Math.max(start, ms(c.start)),
          b = Math.min(end, ms(c.end));
        return b > a
          ? [{ id: randomUUID(), text: c.text, startMs: a - start, endMs: b - start }]
          : [];
      });
      if (cues.length)
        scene.layers.push({
          ...captions,
          cues,
          ...(masterLayerId && { sourceAudioLayerId: masterLayerId }),
        });
      if (audio) {
        const recorded = media.get(audio),
          bound = capture.meta.audioBindings[audio];
        if (recorded?.durationMs && recorded.hasAudio)
          context.narration.takes.push({
            sceneId: scene.id,
            assetId: recorded.id,
            startMs: ms(audioOffset),
            durationMs: recorded.durationMs,
            spokenText: bound,
            stale: !!changed(item) || bound === undefined,
          });
      }
      if (audio) {
        const asset = media.get(audio),
          offset = ms(audioOffset);
        if (!asset?.hasAudio || !asset.durationMs)
          pending(
            'audio',
            'Falta la toma de la escena ' + document.scenes.length + '.',
            offset,
            scene.id,
            { inactiveTake: useMaster, spokenText: capture.meta.audioBindings[audio] }
          );
        else if (!useMaster) {
          const bound = capture.meta.audioBindings[audio];
          scene.layers.push({
            type: 'audio',
            id: randomUUID(),
            assetId: asset.id,
            sourceInMs: 0,
            volume: 1,
            startMs: offset,
            endMs: offset + asset.durationMs,
            visible: true,
            zIndex: 0,
            endAnchor: 'fixed',
            take: {
              durationMs: asset.durationMs,
              provider: 'Motion Studio',
              spokenText: bound ?? '',
              stale: !!changed(item) || bound === undefined,
            },
          });
        }
      }
    }
    document.durationMs = ms(secondsElapsed);
    if (master?.durationMs && master.hasAudio) {
      const length = Math.min(master.durationMs, document.durationMs);
      document.globalAudio.push({
        type: 'audio',
        id: masterLayerId!,
        assetId: master.id,
        sourceInMs: 0,
        volume: 1,
        startMs: 0,
        endMs: length,
        visible: true,
        zIndex: 0,
        endAnchor: 'fixed',
      });
      const issue = masterLengthDiagnostic(master.durationMs, document.durationMs);
      if (issue) context.diagnostics.push(issue);
    } else if (
      ep.audioMaster &&
      !(media.get(ep.audioMaster)?.hasAudio && media.get(ep.audioMaster)?.durationMs)
    ) {
      pending('audio', 'Falta la pista maestra.', 0, undefined, {
        inactiveTake: !!dirty(ep) || ep.scenes.some(changed),
      });
    }
    if (capture.captions?.some((c) => c.words !== undefined))
      context.diagnostics.push({
        severity: 'warning',
        code: 'unverified-words',
        message: 'Se conservó el texto. La fuente no acredita el reloj de cada palabra.',
      });
    if (capture.captions?.some((c) => ms(c.end) > document.durationMs))
      throw new ValidationError('Hay subtítulos fuera de la duración del episodio.');
    if (ep.scenes.some((s) => s.kind || s.design || s.hero || s.diagram))
      context.diagnostics.push({
        severity: 'warning',
        code: 'editorial-layout',
        message:
          'El contenido editorial se conserva en cada escena. Revisa la composición de sus fases y diagramas.',
      });
    return { document, context };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
