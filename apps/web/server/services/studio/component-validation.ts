import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { DiagnosticSchema } from '@workspace/video-project';
import { randomUUID } from 'node:crypto';
import {
  type ComponentSource,
  type Diagnostic,
  type ProjectRecord,
  applyCommand,
  type ProposalInput,
  type LibraryRef,
  type ProjectCommand,
  type Layer,
  type ProjectDraft,
} from '@workspace/video-project';
import { type ExportSnapshot } from '@workspace/render-contract';
import { SealedModuleSchema } from '@workspace/render-contract/component-bundle';
import { ValidationError } from '@/server/lib/utils';

export function candidateDocument(base: ProjectRecord, input: ProposalInput, ref?: LibraryRef) {
  if (base.importContext?.mode === 'original')
    throw new ValidationError('Este original es de solo lectura.');
  let used = false;
  function layerPin(layer: Layer) {
    if (layer.type === 'component' && layer.componentRef.id === '$candidate') {
      if (!ref || layer.componentRef.version !== 1)
        throw new ValidationError('Referencia de candidato no válida.');
      layer.componentRef = ref;
      used = true;
    }
  }
  let document = base.document;
  for (const command of structuredClone(input.commands) as ProjectCommand[]) {
    if (command.type === 'replace-take')
      throw new ValidationError('Las tomas requieren un recibo de generación verificado.');
    const added =
      command.type === 'add-scene'
        ? command.scene.layers
        : command.type === 'add-layer'
          ? [command.layer]
          : [];
    if (added.some((layer) => layer.type === 'audio' && layer.take))
      throw new ValidationError('La propuesta no puede crear metadatos de toma.');
    if (command.type === 'update-layer' && command.patch.assetId) {
      const old = (
        command.sceneId === null
          ? document.globalAudio
          : document.scenes.find((s) => s.id === command.sceneId)?.layers
      )?.find((l) => l.id === command.layerId);
      if (old?.type === 'audio' && old.take)
        throw new ValidationError('La toma debe repararse desde la narración.');
    }
    added.forEach(layerPin);
    if (command.type === 'update-layer' && command.patch.componentRef?.id === '$candidate') {
      if (!ref || command.patch.componentRef.version !== 1)
        throw new ValidationError('Referencia de candidato no válida.');
      command.patch.componentRef = ref;
      used = true;
    }
    if (base.importContext?.narration) {
      const master = base.importContext.narration.masterAssetId;
      if (command.type === 'remove-layer' || command.type === 'update-layer') {
        const current = (
          command.sceneId === null
            ? document.globalAudio
            : document.scenes.find((s) => s.id === command.sceneId)?.layers
        )?.find((l) => l.id === command.layerId);
        if (current?.type === 'audio' && (current.take || current.assetId === master))
          throw new ValidationError('Las tomas importadas se editan desde narración.');
      }
    }
    document = applyCommand(document, command);
  }
  if (
    ref &&
    (!used ||
      !document.scenes.some((s) =>
        s.layers.some(
          (l) =>
            l.type === 'component' &&
            l.visible &&
            l.componentRef.id === ref.id &&
            l.componentRef.version === ref.version
        )
      ))
  )
    throw new ValidationError('Inserta una capa visible con la referencia $candidate.');
  return document;
}
export async function compileAtRenderer(
  owner: string,
  projectId: string,
  proposalId: string,
  input: ComponentSource,
  signal?: AbortSignal
) {
  const { internal } = await import('./remotion-service');
  const response = await internal(
    owner,
    { scope: 'proposal.compile', projectId, proposalId },
    '/studio/components/compile',
    { ownerId: owner, projectId, proposalId, ...input },
    { signal }
  );
  const data = await response.json();
  if (typeof data.error === 'string') throw new ValidationError(data.error);
  return SealedModuleSchema.parse(data);
}
export function changedReviewLayers(base: ProjectDraft, draft: ProjectDraft) {
  const globalVisualChange =
    !isDeepStrictEqual(base.canvas, draft.canvas) ||
    !isDeepStrictEqual(base.styleRef, draft.styleRef) ||
    !isDeepStrictEqual(base.brandSnapshot, draft.brandSnapshot);
  const previous = new Map<string, { layer: Layer; origin: number; duration: number }>();
  let origin = 0;
  for (const scene of base.scenes) {
    for (const layer of scene.layers)
      if (layer.type === 'component')
        previous.set(JSON.stringify([scene.id, layer.id]), {
          layer,
          origin,
          duration: scene.durationMs,
        });
    origin += scene.durationMs;
  }
  const changed: string[] = [];
  origin = 0;
  for (const scene of draft.scenes) {
    for (const layer of scene.layers) {
      if (layer.type !== 'component' || !layer.visible) continue;
      const key = JSON.stringify([scene.id, layer.id]),
        old = previous.get(key);
      if (
        globalVisualChange ||
        !old ||
        old.origin !== origin ||
        old.duration !== scene.durationMs ||
        !isDeepStrictEqual(old.layer, layer)
      )
        changed.push(key);
    }
    origin += scene.durationMs;
  }
  return changed;
}
export async function checkAtRenderer(
  owner: string,
  projectId: string,
  proposalId: string,
  snapshot: ExportSnapshot,
  signal?: AbortSignal,
  focus: string[] = []
): Promise<{
  diagnostics: Diagnostic[];
  samples?: { frame: number; sha256: string; base64: string }[];
  moduleHashes?: string[];
}> {
  const { internal } = await import('./remotion-service');
  const result = await (
    await internal(
      owner,
      { scope: 'proposal.check', projectId, proposalId },
      '/studio/components/check',
      { proposalId, snapshot, focus },
      { signal }
    )
  ).json();
  return z
    .object({
      diagnostics: z.array(DiagnosticSchema),
      moduleHashes: z.array(z.string().regex(/^[0-9a-f]{64}$/)).optional(),
      samples: z
        .array(
          z.object({
            frame: z.int().nonnegative(),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            base64: z.string().max(3500000),
          })
        )
        .max(3)
        .optional(),
    })
    .refine(
      (r) =>
        r.diagnostics.some((d) => d.severity === 'error') ||
        (r.moduleHashes !== undefined && !!r.samples?.length),
      'La comprobación de montaje requiere capturas y módulos revisados.'
    )
    .parse(result);
}
export async function previewCandidate(
  snapshot: ExportSnapshot,
  instance = randomUUID(),
  signal?: AbortSignal
) {
  const { internal } = await import('./remotion-service');
  return internal(
    snapshot.ownerId,
    { scope: 'preview.create', projectId: snapshot.document.id, previewId: instance },
    '/studio/previews',
    { snapshot, instance },
    { signal }
  );
}
