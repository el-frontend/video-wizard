import { StyleBackdrop } from './style-backdrop';
import { Sequence } from 'remotion';
import type { Scene } from '@workspace/video-project';
import { LayerRenderer, type LayerRendererProps } from './layer-renderer';
import { sequenceFrames } from './project-timing';

export function SceneComposition({
  scene,
  ...props
}: Omit<LayerRendererProps, 'layer'> & { scene: Scene }) {
  const layers = scene.layers.filter((l) => l.visible).sort((a, b) => a.zIndex - b.zIndex);
  return (
    <>
      <StyleBackdrop {...props} durationMs={scene.durationMs} />
      {layers.map((layer) => (
        <Sequence
          key={layer.id}
          layout="none"
          {...sequenceFrames(props.origin, layer.startMs, layer.endMs, props.document.canvas.fps)}
        >
          <LayerRenderer {...props} layer={layer} headline={scene.editorial?.headline} />
        </Sequence>
      ))}
    </>
  );
}
