import type { Layer } from '@workspace/video-project';

type VideoLayer = Extract<Layer, { type: 'video' }>;
/** The project always stores original time. A cropped file begins at the covered source in-point. */
export function videoPlayback(layer: VideoLayer) {
  const crop = layer.playbackVariant;
  if (!crop) return { assetId: layer.assetId, sourceInMs: layer.sourceInMs };
  if (
    layer.sourceInMs < crop.sourceStartMs ||
    layer.sourceInMs + layer.endMs - layer.startMs > crop.sourceEndMs
  )
    throw new RangeError(
      'El tramo queda fuera del recorte procesado. Usa el video original o ajusta el intervalo.'
    );
  return { assetId: crop.assetId, sourceInMs: layer.sourceInMs - crop.sourceStartMs };
}
