import type {
  AssetDescriptor,
  Layer,
  ProjectCommand,
  ProjectDraft,
  Scene,
} from '@workspace/video-project';

export type Canvas = ProjectDraft['canvas'];
export type CommandHandler = (command: ProjectCommand) => void;
export type LayerPatch = Extract<ProjectCommand, { type: 'update-layer' }>['patch'];
type Box = Extract<Layer, { type: 'text' }>['box'];

export function moveBeforeId(items: { id: string }[], id: string, direction: -1 | 1) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0 || !items[index + direction]) throw new RangeError('No hay un elemento adyacente.');
  return direction < 0 ? items[index - 1]!.id : (items[index + 2]?.id ?? null);
}

export function fitBox(box: Box, canvas: Canvas): Box {
  const scale = Math.min(1, canvas.width / box.width, canvas.height / box.height);
  const width = box.width * scale,
    height = box.height * scale;
  return {
    width,
    height,
    x: Math.max(0, Math.min(box.x, canvas.width - width)),
    y: Math.max(0, Math.min(box.y, canvas.height - height)),
  };
}

export function boxOverflows(box: Box, canvas: Canvas) {
  return (
    box.x < 0 || box.y < 0 || box.x + box.width > canvas.width || box.y + box.height > canvas.height
  );
}

export function checkLayerRange(layer: Layer, patch: LayerPatch, durationMs?: number) {
  const start = patch.startMs ?? layer.startMs,
    end = patch.endMs ?? layer.endMs;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start)
    return 'El fin debe ser posterior al inicio y ambos deben ser milisegundos enteros.';
  if ('sourceInMs' in layer) {
    if (durationMs === undefined) return 'Falta la duración medida de la fuente.';
    const offset = patch.sourceInMs ?? layer.sourceInMs;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + end - start > durationMs)
      return 'El tramo debe caber en la duración medida de la fuente.';
  }
  return null;
}

function baseLayer(scene: Scene) {
  return {
    id: crypto.randomUUID(),
    startMs: 0,
    endMs: scene.durationMs,
    endAnchor: 'fixed' as const,
    visible: true,
    zIndex: scene.layers.reduce((z, layer) => Math.max(z, layer.zIndex), -1) + 1,
  };
}

export function titleLayer(scene: Scene, canvas: Canvas): Layer {
  return {
    ...baseLayer(scene),
    type: 'text',
    text: 'Título',
    box: {
      x: Math.round(canvas.width * 0.08),
      y: Math.round(canvas.height * 0.4),
      width: canvas.width * 0.84,
      height: canvas.height * 0.2,
    },
    endAnchor: 'scene-end',
  };
}

export function mediaLayer(scene: Scene, canvas: Canvas, asset: AssetDescriptor): Layer {
  const base = { ...baseLayer(scene), assetId: asset.id };
  const box = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (asset.mediaType.startsWith('image/')) return { ...base, type: 'image', box };
  if (!asset.durationMs) throw new Error('El recurso carece de duración medida.');
  const source = {
    ...base,
    endMs: Math.min(scene.durationMs, asset.durationMs),
    sourceInMs: 0,
    volume: 1,
  };
  if (asset.mediaType.startsWith('audio/')) return { ...source, type: 'audio' };
  if (asset.mediaType.startsWith('video/'))
    return { ...source, type: 'video', box, fit: 'cover', focalPoint: { x: 0.5, y: 0.5 } };
  throw new Error('Selecciona un archivo de imagen, audio o video.');
}
