import { z } from 'zod';
import {
  BrandSnapshotSchema,
  IdSchema,
  JsonObjectSchema,
  LibraryRefSchema,
  MillisecondsSchema,
} from './library';
import {
  BoxSchema,
  CanvasSchema,
  CaptionCueSchema,
  FocalPointSchema,
  LayerSchema,
  SceneSchema,
  parseProject,
} from './schema';
import type { Layer, ProjectDraft } from './schema';
import { projectDurationMs } from './time';

const scene = { sceneId: IdSchema };
const scope = { sceneId: IdSchema.nullable() };
const target = { ...scope, layerId: IdSchema };
const sibling = { beforeId: IdSchema.nullable().optional() };
const patch = z
  .strictObject({
    startMs: MillisecondsSchema,
    endMs: MillisecondsSchema,
    endAnchor: z.enum(['fixed', 'scene-end']),
    visible: z.boolean(),
    zIndex: z.int(),
    box: BoxSchema,
    overrides: JsonObjectSchema,
    props: JsonObjectSchema,
    assetId: IdSchema,
    sourceInMs: MillisecondsSchema,
    volume: z.number().nonnegative(),
    fit: z.enum(['cover', 'contain']),
    focalPoint: FocalPointSchema,
    text: z.string(),
    componentRef: LibraryRefSchema,
    templateRef: LibraryRefSchema,
    sourceAudioLayerId: IdSchema,
  })
  .partial();

export const ProjectCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('set-canvas'), canvas: CanvasSchema }),
  z.strictObject({ type: z.literal('set-title'), title: IdSchema }),
  z.strictObject({ type: z.literal('add-scene'), scene: SceneSchema, ...sibling }),
  z.strictObject({ type: z.literal('remove-scene'), ...scene }),
  z.strictObject({ type: z.literal('reorder-scene'), ...scene, ...sibling }),
  z.strictObject({ type: z.literal('add-layer'), ...scope, layer: LayerSchema, ...sibling }),
  z.strictObject({ type: z.literal('remove-layer'), ...target }),
  z.strictObject({
    type: z.literal('reorder-layer'),
    ...target,
    ...sibling,
    order: z.literal('z-index').optional(),
  }),
  z.strictObject({ type: z.literal('update-layer'), ...target, patch }),
  z.strictObject({
    type: z.literal('set-captions'),
    ...scene,
    layerId: IdSchema,
    cues: z.array(CaptionCueSchema),
  }),
  z.strictObject({ type: z.literal('set-narration'), ...scene, text: z.string() }),
  z.strictObject({ type: z.literal('set-headline'), ...scene, text: z.string() }),
  z.strictObject({ type: z.literal('set-brand'), snapshot: BrandSnapshotSchema.nullable() }),
  z.strictObject({ type: z.literal('set-style'), ref: LibraryRefSchema.nullable() }),
  z.strictObject({
    type: z.literal('replace-take'),
    ...scene,
    layerId: IdSchema,
    assetId: IdSchema,
    durationMs: z.int().positive(),
    spokenText: z.string(),
    provider: IdSchema,
    cues: z.array(CaptionCueSchema).optional(),
  }),
  z.strictObject({ type: z.literal('extend-scene'), ...scene, durationMs: z.int().positive() }),
]);
export type ProjectCommand = z.infer<typeof ProjectCommandSchema>;

function indexOfId<T extends { id: string }>(items: T[], id: string) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new RangeError('No existe el elemento: ' + id);
  return index;
}
function get<T extends { id: string }>(items: T[], id: string) {
  return items[indexOfId(items, id)]!;
}
function insert<T extends { id: string }>(items: T[], item: T, beforeId?: string | null) {
  const index = beforeId == null ? items.length : indexOfId(items, beforeId);
  items.splice(index, 0, item);
}
function move<T extends { id: string }>(items: T[], id: string, beforeId?: string | null) {
  const index = indexOfId(items, id);
  if (id === beforeId || items[index + 1]?.id === (beforeId ?? undefined)) return false;
  const [item] = items.splice(index, 1);
  insert(items, item!, beforeId);
  return true;
}

export function applyCommand(project: ProjectDraft, input: ProjectCommand): ProjectDraft {
  const command = ProjectCommandSchema.parse(input);
  // Zod returns an independent draft; failed edits never mutate the caller's revision.
  const draft = parseProject(project);
  const scenes = draft.scenes;
  function layersFor(sceneId: string | null): Layer[] {
    return sceneId === null ? draft.globalAudio : get(scenes, sceneId).layers;
  }
  switch (command.type) {
    case 'set-canvas':
      draft.canvas = command.canvas;
      break;
    case 'set-title':
      draft.title = command.title;
      break;
    case 'add-scene':
      insert(scenes, command.scene, command.beforeId);
      break;
    case 'remove-scene':
      scenes.splice(indexOfId(scenes, command.sceneId), 1);
      break;
    case 'reorder-scene':
      move(scenes, command.sceneId, command.beforeId);
      break;
    case 'add-layer':
      insert(layersFor(command.sceneId), command.layer, command.beforeId);
      if ('assetId' in command.layer && !draft.assetIds.includes(command.layer.assetId))
        draft.assetIds.push(command.layer.assetId);
      break;
    case 'remove-layer': {
      const layers = layersFor(command.sceneId);
      layers.splice(indexOfId(layers, command.layerId), 1);
      break;
    }
    case 'reorder-layer': {
      const layers = layersFor(command.sceneId);
      const ordered = command.order ? [...layers].sort((a, b) => a.zIndex - b.zIndex) : layers;
      if (!move(ordered, command.layerId, command.beforeId)) break;
      if (ordered !== layers) layers.splice(0, layers.length, ...ordered);
      layers.forEach((layer, i) => {
        layer.zIndex = i;
      });
      break;
    }
    case 'update-layer': {
      const layer = get(layersFor(command.sceneId), command.layerId);
      Object.assign(layer, command.patch);
      break;
    }
    case 'set-captions': {
      const layer = get(layersFor(command.sceneId), command.layerId);
      if (layer.type !== 'captions') throw new RangeError('Se requiere una capa de subtítulos');
      layer.cues = command.cues;
      break;
    }
    case 'set-headline':
    case 'set-narration': {
      const edited = get(scenes, command.sceneId);
      edited.editorial ??= {};
      if (command.type === 'set-headline') edited.editorial.headline = command.text;
      else {
        edited.editorial.narration = command.text;
        for (const layer of edited.layers) {
          if (layer.type === 'audio' && layer.take)
            layer.take.stale = layer.take.spokenText !== command.text;
        }
      }
      break;
    }
    case 'set-brand':
      draft.brandSnapshot = command.snapshot;
      break;
    case 'set-style':
      draft.styleRef = command.ref;
      break;
    case 'replace-take': {
      const edited = get(scenes, command.sceneId);
      const layer = get(edited.layers, command.layerId);
      if (layer.type !== 'audio') throw new RangeError('Se requiere una capa de audio');
      layer.assetId = command.assetId;
      layer.sourceInMs = 0;
      layer.endMs = layer.startMs + command.durationMs;
      layer.endAnchor = 'fixed';
      layer.take = {
        durationMs: command.durationMs,
        provider: command.provider,
        spokenText: command.spokenText,
        stale:
          edited.editorial?.narration !== undefined &&
          edited.editorial.narration !== command.spokenText,
      };
      if (!draft.assetIds.includes(command.assetId)) draft.assetIds.push(command.assetId);
      if (command.cues === undefined) break;
      const linked = edited.layers.filter(
        (candidate): candidate is Extract<Layer, { type: 'captions' }> =>
          candidate.type === 'captions' && candidate.sourceAudioLayerId === layer.id
      );
      if (command.cues.length && !linked.length) {
        throw new RangeError(
          'Se requiere una capa vinculada para guardar los subtítulos de la toma'
        );
      }
      for (const captions of linked) {
        captions.cues = command.cues;
      }
      break;
    }
    case 'extend-scene': {
      const edited = get(scenes, command.sceneId);
      if (command.durationMs < edited.durationMs)
        throw new RangeError('La ampliación no puede acortar la escena');
      if (command.durationMs === edited.durationMs) break;
      edited.durationMs = command.durationMs;
      for (const layer of edited.layers)
        if (layer.endAnchor === 'scene-end') layer.endMs = Math.max(layer.endMs, edited.durationMs);
      break;
    }
  }
  draft.durationMs = projectDurationMs(draft);
  return parseProject(draft);
}
