import {
  applyCommand,
  CaptionInputSchema,
  IdSchema,
  type ProjectRecord,
} from '@workspace/video-project';
import { z } from 'zod';
import { ValidationError } from '@/server/lib/utils';
import type { AssetService } from './asset-service';
import { ConflictError, type ProjectService } from './project-service';

const replacement = z.strictObject({
  baseRevision: IdSchema,
  sceneId: IdSchema,
  audioLayerId: IdSchema,
  assetId: IdSchema,
  captions: z.array(CaptionInputSchema).optional(),
});
export class AudioService {
  constructor(
    private readonly projects: ProjectService,
    private readonly assets: AssetService
  ) {}
  async replace(ownerId: string, projectId: string, input: unknown): Promise<ProjectRecord> {
    const result = replacement.safeParse(input);
    if (!result.success)
      throw new ValidationError(
        'Comprueba la revisión, las capas y el texto y los tiempos de cada subtítulo y palabra.'
      );
    const { baseRevision, sceneId, audioLayerId, assetId, captions } = result.data;
    const current = await this.projects.get(ownerId, projectId);
    if (current.revision !== baseRevision) throw new ConflictError(current);
    const asset = await this.assets.get(ownerId, assetId);
    if (
      !asset.hasAudio ||
      !/^(audio|video)\//.test(asset.mediaType) ||
      !asset.durationMs ||
      asset.durationMs <= 0
    )
      throw new ValidationError('Selecciona un recurso con pista de audio y duración medida.');
    const scene = current.document.scenes.find((s) => s.id === sceneId);
    const audio = scene?.layers.find((l) => l.id === audioLayerId);
    if (!scene || audio?.type !== 'audio')
      throw new ValidationError('Selecciona una capa de audio de esta escena.');
    const durationMs = asset.durationMs;
    if (!Number.isSafeInteger(audio.startMs + durationMs))
      throw new ValidationError('El final de la toma excede el intervalo permitido.');
    if (captions?.some((cue) => cue.endMs > durationMs))
      throw new ValidationError('Los subtítulos deben caber en la duración medida de la toma.');
    if (captions && new Set(captions.map((c) => c.id)).size !== captions.length)
      throw new ValidationError('Cada subtítulo necesita un identificador único.');
    let document = applyCommand(current.document, {
      type: 'replace-take',
      sceneId,
      layerId: audioLayerId,
      assetId,
      durationMs,
      provider: 'upload',
      spokenText: scene.editorial?.narration ?? '',
    });
    if (captions) {
      const linked = scene.layers.filter(
        (l) => l.type === 'captions' && l.sourceAudioLayerId === audioLayerId
      );
      if (captions.length && !linked.length)
        throw new ValidationError(
          'Vincula una capa de subtítulos a esta toma antes de reemplazarla.'
        );
      for (const layer of linked) {
        const offset = audio.startMs - layer.startMs;
        const cues = captions.map((c) => ({
          ...c,
          startMs: c.startMs + offset,
          endMs: c.endMs + offset,
        }));
        if (cues.some((c) => c.startMs < 0))
          throw new ValidationError(
            'Hay subtítulos anteriores al inicio de su capa. Adelanta la capa vinculada antes de reemplazar la toma.'
          );
        document = applyCommand(document, {
          type: 'set-captions',
          sceneId,
          layerId: layer.id,
          cues,
        });
      }
    }
    return this.projects.save(ownerId, projectId, { baseRevision, document });
  }
}
