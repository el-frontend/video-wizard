import { isDeepStrictEqual } from 'node:util';
import type { Diagnostic, ImportContext, ProjectDraft } from '@workspace/video-project';

export function masterLengthDiagnostic(durationMs: number, sequenceMs: number): Diagnostic | null {
  if (durationMs > sequenceMs)
    return {
      severity: 'warning',
      code: 'master-tail',
      message:
        'El archivo maestro contiene audio posterior al final de la secuencia. Se conservó el archivo completo.',
    };
  if (durationMs < sequenceMs)
    return {
      severity: 'warning',
      code: 'master-length',
      message: 'La pista maestra termina antes del final del episodio.',
    };
  return null;
}

export function repairMaster(
  draft: ProjectDraft,
  context: ImportContext,
  audio: ProjectDraft['globalAudio'][number],
  durationMs: number,
  original: ProjectDraft | undefined,
  stale: boolean
) {
  const narration = context.narration!;
  const keepSceneNarration =
    stale ||
    !!narration.masterAssetId ||
    context.slots.some(
      (slot) => slot.kind === 'audio' && slot.sceneId && slot.resolution === 'replaced'
    );
  narration.masterAssetId = audio.assetId;
  const sourceTakes = new Set(
    original?.scenes.flatMap((s) => s.layers.filter((l) => l.type === 'audio').map((l) => l.id))
  );
  const timeline = (doc: ProjectDraft) =>
    doc.scenes.map((scene) => [
      scene.id,
      scene.durationMs,
      scene.editorial?.narration,
      scene.layers.filter((l) => l.type === 'audio' && (sourceTakes.has(l.id) || l.take)),
    ]);
  const sequenceMs = draft.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
  const length = masterLengthDiagnostic(durationMs, sequenceMs);
  if (length) context.diagnostics.push(length);
  if (
    keepSceneNarration ||
    !original ||
    !sequenceMs ||
    !isDeepStrictEqual(timeline(original), timeline(draft))
  ) {
    context.diagnostics.push({
      severity: 'warning',
      code: 'master-inactive',
      message:
        'Se conservó la pista maestra como recurso. La edición actual mantiene la narración por escenas.',
    });
    return;
  }
  narration.playback = 'master';
  draft.globalAudio.push({ ...audio, endMs: Math.min(durationMs, sequenceMs) });
  const sourceCaptions = new Set(
    original.scenes.flatMap((s) => s.layers.filter((l) => l.type === 'captions').map((l) => l.id))
  );
  for (const scene of draft.scenes) {
    scene.layers = scene.layers.filter((l) => !sourceTakes.has(l.id));
    for (const layer of scene.layers)
      if (
        layer.type === 'captions' &&
        (layer.sourceAudioLayerId
          ? sourceTakes.has(layer.sourceAudioLayerId)
          : sourceCaptions.has(layer.id))
      )
        layer.sourceAudioLayerId = audio.id;
  }
  for (const pending of context.slots) {
    if (pending.resolution === 'pending' && pending.kind === 'audio' && pending.sceneId)
      pending.inactiveTake = true;
  }
}
