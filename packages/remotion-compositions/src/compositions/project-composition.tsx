import { useEffect, useState } from 'react';
import { AbsoluteFill, Sequence, cancelRender, continueRender, delayRender } from 'remotion';
import { sceneFrames, type ResolvedDependencies } from '@workspace/render-contract';
import type { ProjectDraft } from '@workspace/video-project';
import { LayerRenderer, type ProjectRegistry } from './layer-renderer';
import { SceneComposition } from './scene-composition';
import { projectAppearance } from './project-appearance';
import { sequenceFrames } from './project-timing';

export { projectMetadata, captionAt, sequenceFrames } from './project-timing';
export type { ProjectRegistry } from './layer-renderer';

function SnapshotFonts({ dependencies }: { dependencies: ResolvedDependencies }) {
  const [handle] = useState(() => delayRender('Cargando fuentes fijadas'));
  useEffect(() => {
    let active = true;
    const fonts = Object.values(dependencies.libraries).flatMap((entry) =>
      'fonts' in entry ? (entry.fonts ?? []) : []
    );
    const faces = fonts.map(
      (font) =>
        new FontFace(
          font.family,
          'url(' + JSON.stringify(dependencies.assets[font.assetId]!.url) + ')',
          { weight: font.weight.min + ' ' + font.weight.max }
        )
    );
    Promise.all(faces.map((face) => face.load())).then(
      () => {
        if (active) {
          faces.forEach((face) => document.fonts.add(face));
          continueRender(handle);
        }
      },
      (error) => {
        if (active) cancelRender(error);
      }
    );
    return () => {
      active = false;
      faces.forEach((face) => document.fonts.delete(face));
    };
  }, [dependencies, handle]);
  return null;
}

export type ProjectCompositionProps = {
  document: ProjectDraft;
  dependencies: ResolvedDependencies;
  registry: ProjectRegistry;
};
export function ProjectComposition(props: ProjectCompositionProps) {
  const { document, dependencies } = props;
  const { fps } = document.canvas;
  const boundaries = sceneFrames(document);
  return (
    <AbsoluteFill style={{ backgroundColor: projectAppearance(document, dependencies).background }}>
      <SnapshotFonts dependencies={dependencies} />
      {document.scenes.map((scene, index) => {
        const { from, durationInFrames, originMs } = boundaries[index]!;
        if (!durationInFrames) return null;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
            <SceneComposition {...props} scene={scene} origin={originMs} />
          </Sequence>
        );
      })}
      {document.globalAudio
        .filter((l) => l.visible)
        .map((layer) => (
          <Sequence
            key={layer.id}
            layout="none"
            {...sequenceFrames(0, layer.startMs, layer.endMs, fps)}
          >
            <LayerRenderer {...props} layer={layer} origin={0} />
          </Sequence>
        ))}
    </AbsoluteFill>
  );
}
