import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { loadStylePack, stylePackFonts } from '@workspace/style-packs';
import type { Layer, LibraryEntry } from '@workspace/video-project';
import { exampleProject } from '@workspace/video-project/fixtures';
import {
  projectPins,
  libraryKey,
  validateSnapshot,
  type ExportSnapshot,
  type ResolvedAsset,
} from './snapshot';
import { sceneFrames } from './index';
it('retains distinct references and coalesces identical version pins', () => {
  const document = exampleProject();
  document.scenes[0]!.templateRef = { id: 'sub', version: 3 };
  document.scenes[1]!.templateRef = { id: 'sub', version: 4 };
  expect(projectPins(document).map(libraryKey)).toEqual([
    '["estilo",2]',
    '["marca",1]',
    '["sub",3]',
    '["card",1]',
    '["sub",4]',
  ]);
});

function fixture(): ExportSnapshot {
  const document = exampleProject();
  document.scenes = [document.scenes[1]!];
  document.durationMs = 3000;
  document.assetIds = [];
  document.globalAudio = [];
  document.brandSnapshot = null;
  const style = {
    ...document.styleRef!,
    name: 'Marca',
    family: { id: 'noticias-liquid-glass', version: 1 } as const,
    kind: 'style' as const,
    engines: ['remotion' as const],
    assetIds: ['font'],
    tokens: { typography: { display: { fontFamily: 'Geist', weight: 600 } } },
    fonts: [{ family: 'Geist', assetId: 'font', weight: { min: 400, max: 700 } }],
  };
  return {
    ownerId: 'owner',
    revision: 'v',
    document,
    diagnostics: [],
    bundles: {},
    dependencies: {
      assets: { font: asset('font', 'font/woff2') },
      libraries: { [libraryKey(style)]: style },
    },
  };
}
function asset(id: string, mediaType: string): ResolvedAsset {
  return { id, name: id, url: id, hash: 'f'.repeat(64), mediaType };
}
it('rejects a style which declares a verified engine but has no known family', () => {
  const snap = fixture();
  const style = Object.values(snap.dependencies.libraries)[0]!;
  if (style.kind !== 'style') throw Error('fixture');
  delete style.family;
  expect(validateSnapshot(snap)).toContainEqual(expect.objectContaining({ code: 'style-engine' }));
});
it('validates the resolved font family and weight for each text layer', () => {
  const snapshot = fixture(),
    layer = snapshot.document.scenes[0]!.layers[0]!;
  expect(validateSnapshot(snapshot)).toEqual([]);
  for (const display of [
    { fontFamily: 'Ghost', weight: 600 },
    { fontFamily: 'Geist', weight: 800 },
  ]) {
    layer.overrides = { typography: { display } };
    expect(validateSnapshot(snapshot)).toContainEqual(
      expect.objectContaining({
        code: 'font-unresolved',
        severity: 'error',
        sceneId: 'outro',
        layerId: 'bye',
      })
    );
  }
  snapshot.document.styleRef = null;
  delete layer.overrides;
  expect(validateSnapshot(snapshot)).toEqual([]);
});

it('requires the actual weight of the pinned Viral preset for captions and components', async () => {
  const snapshot = fixture();
  const { document, dependencies } = snapshot;
  const fonts = await Promise.all(
    stylePackFonts.map(async ({ family, filename, source, weight }) => {
      const hash = createHash('sha256')
        .update(await readFile(source))
        .digest('hex');
      dependencies.assets[filename] = { ...asset(filename, 'font/woff2'), hash };
      return { family, assetId: filename, weight };
    })
  );
  const style: LibraryEntry = {
    ...(await loadStylePack('noticias-modern-editorial')),
    version: 2,
    engines: ['remotion'],
    assetIds: fonts.map(({ assetId }) => assetId),
    fonts,
  };
  const preset: LibraryEntry = {
    kind: 'component',
    id: 'viral',
    version: 1,
    name: 'Viral',
    assetIds: [],
    engine: 'remotion',
    manifest: { version: 1, props: {}, builtin: { kind: 'remotion-caption', preset: 'viral' } },
  };
  document.styleRef = { id: style.id, version: style.version };
  dependencies.libraries = { [libraryKey(style)]: style, [libraryKey(preset)]: preset };
  const presetRef = { id: preset.id, version: preset.version };
  const timing = {
    startMs: 0,
    endMs: 3000,
    endAnchor: 'fixed' as const,
    visible: true,
    zIndex: 1,
    box: { x: 0, y: 0, width: 1080, height: 1920 },
  };
  const captions: Extract<Layer, { type: 'captions' }> = {
    ...timing,
    id: 'captions',
    type: 'captions',
    templateRef: presetRef,
    cues: [{ id: 'cue', startMs: 0, endMs: 2000, text: 'Hola' }],
  };
  const component: Extract<Layer, { type: 'component' }> = {
    ...timing,
    id: 'component',
    type: 'component',
    componentRef: presetRef,
    props: {},
  };
  document.scenes[0]!.layers.push(captions, component);
  expect(validateSnapshot(snapshot)).toEqual(
    ['captions', 'component'].map((layerId) => ({
      code: 'font-unresolved',
      severity: 'error',
      sceneId: 'outro',
      layerId,
      message: 'No se ha fijado la fuente «Archivo Black» con peso 900.',
    }))
  );

  // The heading still uses Archivo Black 400 while the preset can use Geist 900.
  captions.overrides = { typography: { display: { fontFamily: 'Geist' } } };
  component.overrides = captions.overrides;
  expect(validateSnapshot(snapshot)).toEqual([]);

  delete captions.templateRef;
  delete captions.overrides;
  expect(validateSnapshot(snapshot)).toEqual([]);

  component.overrides = { typography: { display: { fontFamily: 'sans-serif' } } };
  expect(validateSnapshot(snapshot)).toEqual([]);
});

it('validates media kind, measured entry time and global audio without trimming the editorial tail', () => {
  const s = fixture(),
    scene = s.document.scenes[0]!,
    base = { startMs: 0, endMs: 3000, visible: true, endAnchor: 'fixed' as const, zIndex: 0 };
  s.document.assetIds = ['clip', 'picture', 'audio'];
  Object.assign(s.dependencies.assets, {
    clip: { ...asset('clip', 'video/mp4'), durationMs: 900, hasAudio: false },
    picture: asset('picture', 'image/png'),
    audio: { ...asset('audio', 'audio/wav'), durationMs: 450, hasAudio: true },
  });
  const clip = {
    ...base,
    id: 'clip',
    type: 'video' as const,
    assetId: 'clip',
    sourceInMs: 899,
    volume: 1,
    fit: 'cover' as const,
    focalPoint: { x: 0.5, y: 0.5 },
    box: { x: 0, y: 0, width: 100, height: 100 },
  };
  const audio = {
    ...base,
    id: 'track',
    type: 'audio' as const,
    assetId: 'audio',
    volume: 1,
    sourceInMs: 449,
  };
  scene.layers = [clip];
  s.document.globalAudio = [audio];
  expect(validateSnapshot(s)).toEqual([]);
  clip.assetId = 'picture';
  audio.sourceInMs = 450;
  expect(validateSnapshot(s)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'media-type', layerId: 'clip', sceneId: 'outro' }),
      expect.objectContaining({ code: 'source-in-range', layerId: 'track' }),
    ])
  );
  clip.assetId = 'clip';
  clip.sourceInMs = 910;
  audio.assetId = 'clip';
  audio.sourceInMs = 0;
  expect(validateSnapshot(s)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'source-in-range', layerId: 'clip' }),
      expect.objectContaining({ code: 'media-type', layerId: 'track' }),
    ])
  );
});
it('gives adjacent scenes one shared cut and diagnoses a scene with no displayable frame', () => {
  const s = fixture();
  s.document.scenes = [1017, 1, 1017].map((durationMs, i) => ({
    id: String(i),
    durationMs,
    layers: [],
  }));
  s.document.durationMs = 2035;
  expect(sceneFrames(s.document)).toEqual([
    { originMs: 0, from: 0, durationInFrames: 30 },
    { originMs: 1017, from: 30, durationInFrames: 0 },
    { originMs: 1018, from: 30, durationInFrames: 32 },
  ]);
  expect(validateSnapshot(s)).toContainEqual(
    expect.objectContaining({ code: 'scene-no-frame', severity: 'error', sceneId: '1' })
  );
});
