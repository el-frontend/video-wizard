import { expect, test } from 'vitest';
import {
  AssetRecordSchema,
  CompanionRequestSchema,
  LibraryEntrySchema,
  ProjectRecordSchema,
  parseProject,
  validateForExport,
} from './index';
import { exampleProject } from './fixtures/projects';

test('round-trips words, editable JSON, IDs and exact library versions', () => {
  const draft = exampleProject();
  const roundTripped = parseProject(JSON.parse(JSON.stringify(draft)));
  expect(roundTripped).toStrictEqual(draft);
});

test('export requires resolution for every pinned library entry, including the scene template', () => {
  const project = exampleProject();
  project.scenes[0]!.templateRef = { id: 'story', version: 4 };
  const errors = validateForExport(project);
  expect(errors).toHaveLength(5);
  expect(errors.every((d) => d.severity === 'error' && d.code === 'library-missing')).toBe(true);
  const common = { name: 'Ejemplo', assetIds: [] };
  const implementation = { engine: 'remotion', manifest: { version: 1, props: {} } };
  const library = [
    { ...common, ...project.styleRef, kind: 'style', tokens: {} },
    { ...common, ...project.brandSnapshot!.ref, kind: 'brand', values: {} },
    { ...common, ...project.scenes[0]!.templateRef, kind: 'template', ...implementation },
    { ...common, id: 'sub', version: 3, kind: 'component', ...implementation },
    {
      ...common,
      id: 'card',
      version: 1,
      kind: 'component',
      ...implementation,
      manifest: { version: 1, props: { headline: { type: 'string', required: true } } },
    },
  ].map((entry) => LibraryEntrySchema.parse(entry));
  expect(validateForExport(project, { library })).toEqual([]);
});

test.each([
  { engine: 'other' },
  { schemaVersion: 2 },
  { title: '   ' },
  { durationMs: 7200.5 },
  { durationMs: 42 },
  { canvas: { width: 10, height: 10, fps: 0 } },
])('rejects malformed project %j', (patch) => {
  expect(() => parseProject({ ...exampleProject(), ...patch })).toThrow();
});

test('rejects negative, fractional and backwards layer ranges, global anchoring and ambiguous IDs', () => {
  const draft = exampleProject();
  const track = draft.globalAudio[0]!;
  for (const patch of [
    { startMs: -1 },
    { startMs: 1.5 },
    { endMs: 500 },
    { endAnchor: 'scene-end' },
    { id: 'speech' },
  ]) {
    expect(() => parseProject({ ...draft, globalAudio: [{ ...track, ...patch }] })).toThrow();
  }
});

test('rejects executable props and mixed engines in a layer', () => {
  const draft = exampleProject();
  const scene = draft.scenes[0]!;
  const component = scene.layers[2]!;
  for (const patch of [{ props: { callback: () => 123 } }, { engine: 'hyperframes' }]) {
    expect(() =>
      parseProject({
        ...draft,
        scenes: [{ ...scene, layers: [{ ...component, ...patch }] }, draft.scenes[1]],
      })
    ).toThrow();
  }
});

test('keeps dangling references and local overflow editable and reports their locations', () => {
  const draft = exampleProject();
  draft.assetIds = ['music'];
  draft.scenes[0]!.layers[0]!.endMs = 4800;
  const caps = draft.scenes[0]!.layers[1]!;
  if (caps.type !== 'captions') throw Error('fixture');
  caps.sourceAudioLayerId = 'gone';
  caps.cues[0]!.words![0]!.endMs = 4000;
  caps.cues[0]!.endMs = 4700;
  expect(parseProject(draft)).toStrictEqual(draft);
  expect(validateForExport(draft)).toEqual(
    expect.arrayContaining(
      [
        ['asset-missing', 'speech'],
        ['layer-overflow', 'speech'],
        ['audio-layer-missing', 'captions'],
        ['cue-overflow', 'captions'],
      ].map(([code, layerId]) =>
        expect.objectContaining({ code, severity: 'error', sceneId: 'intro', layerId })
      )
    )
  );
  caps.cues[0]!.endMs = 900;
  expect(validateForExport(draft)).toContainEqual(
    expect.objectContaining({ code: 'word-overflow' })
  );
});

test('checks pinned entry kind, exact version, component engine and manifest props against a supplied catalog', () => {
  const draft = exampleProject();
  const card = LibraryEntrySchema.parse({
    id: 'card',
    version: 1,
    kind: 'component',
    name: 'Tarjeta',
    assetIds: [],
    engine: 'remotion',
    manifest: { version: 1, props: { headline: { type: 'string', required: true } } },
  });
  expect(validateForExport(draft, { library: [card] }).filter((d) => d.layerId === 'card')).toEqual(
    []
  );
  for (const [entry, code] of [
    [{ ...card, version: 2 }, 'library-missing'],
    [{ ...card, engine: 'hyperframes' }, 'engine-mismatch'],
    [{ ...card, manifest: { version: 1, props: {} } }, 'component-props'],
  ] as const) {
    expect(validateForExport(draft, { library: [LibraryEntrySchema.parse(entry)] })).toContainEqual(
      expect.objectContaining({ code, layerId: 'card' })
    );
  }
  expect(validateForExport(draft, { library: [] })).toContainEqual(
    expect.objectContaining({ code: 'library-missing', layerId: 'captions' })
  );
});

test('accepts a server revision and rejects an owner inside the client document', () => {
  const document = parseProject(exampleProject());
  expect(
    ProjectRecordSchema.parse({
      document,
      ownerId: 'u',
      revision: 'rev-aa',
      updatedAt: '2026-11-18T00:00:00Z',
    }).revision
  ).toBe('rev-aa');
  expect(() => parseProject({ ...document, ownerId: 'other' })).toThrow();
});

test('asset metadata uses a confined store key and does not invent measurements', () => {
  const asset = {
    id: 'a',
    ownerId: 'u',
    hash: 'a'.repeat(64),
    name: 'voz cubana.mp3',
    mediaType: 'audio/mpeg',
    locator: 'aa/abcd',
    durationMs: 4800,
  };
  expect(AssetRecordSchema.parse(asset)).toStrictEqual(asset);
  for (const locator of ['../escape', '/tmp/file', 'https://x/a', 'a/../b', 'a\\b']) {
    expect(AssetRecordSchema.safeParse({ ...asset, locator }).success).toBe(false);
  }
});

test('keeps assistant delivery states separate from completion and binds selection to the request', () => {
  const request = {
    id: 'r',
    projectId: 'p',
    baseRevision: 'rev',
    provider: 'codex',
    bindingId: 'b',
    engine: 'hyperframes',
    selection: { sceneId: null, layerId: null, captionId: null, timeMs: 20 },
    kind: 'feedback',
    message: 'Revisar',
    status: 'delivery-unknown',
    idempotencyKey: 'k',
  };
  expect(CompanionRequestSchema.parse(request)).toStrictEqual(request);
  expect(CompanionRequestSchema.safeParse({ ...request, status: 'done' }).success).toBe(false);
});

test('allows captions to reference a project-wide audio track', () => {
  const draft = exampleProject();
  const captions = draft.scenes[0]!.layers[1]!;
  if (captions.type !== 'captions') throw Error('fixture');
  captions.sourceAudioLayerId = 'music-track';
  expect(validateForExport(draft).map((d) => d.code)).not.toContain('audio-layer-missing');
});

test('retains all JSON object keys and independent nested values across parsing', () => {
  const draft = exampleProject();
  const component = draft.scenes[0]!.layers[2]!;
  if (component.type !== 'component') throw Error('fixture');
  component.props = JSON.parse(
    '{"__proto__":"custom","nested":{"__proto__":42,"name":"original"}}'
  );
  const result = parseProject(draft).scenes[0]!.layers[2]!;
  if (result.type !== 'component') throw Error('fixture');
  expect(JSON.stringify(result.props)).toEqual(
    '{"__proto__":"custom","nested":{"__proto__":42,"name":"original"}}'
  );
  expect(result.props.nested).not.toBe(component.props.nested);
});
