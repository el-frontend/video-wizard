import { describe, expect, it, vi } from 'vitest';
import { ShortService, sliceCaptions } from './short-service';
import { sourceCues } from '@/features/studio-shorts/lib/timing';
import type { Job } from '../job-history-service';
import type { ProjectDraft } from '@workspace/video-project';

const owner = 'dueño';
const source = {
  id: 'fuente',
  ownerId: owner,
  name: 'Muestra.mp4',
  locator: 'private',
  hash: 'f'.repeat(64),
  mediaType: 'video/mp4',
  durationMs: 24000,
  hasAudio: true,
};
const request = {
  assetId: source.id,
  engine: 'remotion',
  canvas: { width: 1080, height: 1920, fps: 30 },
  ranges: [
    { startMs: 5000, endMs: 12000 },
    { startMs: 17000, endMs: 23000 },
  ],
  sourceCaptions: [
    {
      id: 'a',
      startMs: 4700,
      endMs: 6200,
      text: 'Antes hola mundo',
      words: [
        { text: 'Antes', startMs: 0, endMs: 100 },
        { text: 'hola', startMs: 100, endMs: 500 },
        { text: 'mundo', startMs: 500, endMs: 1500 },
      ],
    },
    { id: 'b', startMs: 11500, endMs: 12500, text: 'un segmento' },
  ],
};
function setup() {
  const get = vi.fn(async (who: string) => {
    if (who !== owner) throw Error('Recurso no encontrado');
    return source;
  });
  const insert = vi.fn(async (ownerId: string, docs: ProjectDraft[]) =>
    docs.map((document) => ({ ownerId, document, revision: 'r', updatedAt: 'now' }))
  );
  const prepare = vi.fn();
  return {
    service: new ShortService(
      { get },
      { createFromDocuments: insert },
      { prepare },
      { getById: vi.fn() }
    ),
    insert,
    prepare,
  };
}
describe('editable shorts', () => {
  it('creates one ordered batch with exact trims, a cut-through caption and a silent second range', async () => {
    const { service, insert } = setup();
    const [a, b] = await service.create(owner, request);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(a!.document.id).not.toBe(b!.document.id);
    expect([a!.document, b!.document].map((d) => [d.durationMs, d.scenes[0]!.layers[0]])).toEqual([
      [
        7000,
        expect.objectContaining({ assetId: source.id, sourceInMs: 5000, startMs: 0, endMs: 7000 }),
      ],
      [
        6000,
        expect.objectContaining({ assetId: source.id, sourceInMs: 17000, startMs: 0, endMs: 6000 }),
      ],
    ]);
    expect(a!.document.scenes[0]!.layers.find((l) => l.type === 'captions')?.cues).toEqual([
      expect.objectContaining({
        startMs: 0,
        endMs: 1200,
        text: 'hola mundo',
        words: [
          { text: 'hola', startMs: 0, endMs: 200 },
          { text: 'mundo', startMs: 200, endMs: 1200 },
        ],
      }),
      expect.objectContaining({ startMs: 6500, endMs: 7000, text: 'un segmento' }),
    ]);
    expect(b!.document.scenes[0]!.layers).toHaveLength(1);
  });
  it('does not display a timed word ending at the exact left boundary', () => {
    expect(
      sliceCaptions(
        [
          {
            id: 'c',
            startMs: 0,
            endMs: 6000,
            text: 'antes',
            words: [{ text: 'antes', startMs: 0, endMs: 5000 }],
          },
        ],
        request.ranges[0]!
      )
    ).toEqual([]);
  });
  it.each([
    { startMs: 2000, endMs: 1000 },
    { startMs: 100, endMs: 25000 },
    { startMs: 0.1, endMs: 500 },
  ])('rejects the entire invalid batch', async (last) => {
    const { service, insert } = setup();
    await expect(
      service.create(owner, { ...request, ranges: [request.ranges[0], last] })
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
  it('verifies source ownership before insertion', async () => {
    const { service, insert } = setup();
    await expect(service.create('otro', request)).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
  it('rejects cues outside the source and words outside their cue', async () => {
    const { service, insert } = setup();
    for (const cue of [
      { id: 'a', startMs: 0, endMs: 24001, text: 'x' },
      {
        id: 'a',
        startMs: 2010,
        endMs: 2060,
        text: 'x',
        words: [{ text: 'x', startMs: 10, endMs: 60 }],
      },
    ])
      await expect(service.create(owner, { ...request, sourceCaptions: [cue] })).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('processed clip provenance', () => {
  const sourceAssetId = '6cd13a0f-17c5-4100-bcaf-6f53ad7d6b50',
    derivedAssetId = '0473ad7c-9b8e-4c2c-a75f-cab9f78190e2',
    jobId = '365be7a1-dd0e-4cd8-99a1-b2f1b200d3e2';
  const input = {
    jobId,
    engine: request.engine,
    canvas: request.canvas,
    clipCaptions: [{ id: 'c', startMs: 0, endMs: 7000, text: 'Edición' }],
  };
  const job = {
    id: jobId,
    type: 'clip_creation',
    status: 'completed',
    userId: owner,
    inputData: { sourceAssetId, startMs: 5000, endMs: 12000 },
    resultData: { sourceAssetId, derivedAssetId },
  };
  function fixture(record: unknown = job, durationMs = 7000) {
    const get = vi.fn(async (who: string, id: string) => {
      if (who !== owner || ![sourceAssetId, derivedAssetId].includes(id)) throw Error('missing');
      return { ...source, id, durationMs: id === sourceAssetId ? 24000 : durationMs };
    });
    const createFromDocuments = vi.fn(async (ownerId: string, docs: ProjectDraft[]) =>
      docs.map((document) => ({ ownerId, document, revision: 'r', updatedAt: 'now' }))
    );
    const getById = vi.fn(async (id: string, who: string) =>
      who === owner && id === jobId ? (record as Job) : null
    );
    return {
      service: new ShortService(
        { get },
        { createFromDocuments },
        { prepare: vi.fn() },
        { getById }
      ),
      createFromDocuments,
    };
  }
  it('opens the raw processed crop with edited local captions at zero', async () => {
    const { service } = fixture();
    const { document: d } = await service.fromJob(owner, input);
    expect(d.assetIds).toEqual([sourceAssetId, derivedAssetId]);
    const [v, c] = d.scenes[0]!.layers;
    expect(v).toMatchObject({
      sourceInMs: 5000,
      assetId: sourceAssetId,
      playbackVariant: {
        kind: 'processed-crop',
        assetId: derivedAssetId,
        jobId,
        sourceStartMs: 5000,
        sourceEndMs: 12000,
      },
    });
    expect(c).toMatchObject({ cues: [{ startMs: 0, endMs: 7000, text: 'Edición' }] });
  });
  it('rejects foreign jobs, raw historic paths, burned renders and short derived files', async () => {
    for (const [who, record, duration] of [
      [owner, { ...job, inputData: { video_path: 'uploads/old.mp4' } }, 7000],
      ['otro', job, 7000],
      [owner, { ...job, type: 'render' }, 7000],
      [owner, job, 6999],
    ] as const) {
      const { service, createFromDocuments } = fixture(record, duration);
      await expect(service.fromJob(who, input)).rejects.toThrow();
      expect(createFromDocuments).not.toHaveBeenCalled();
    }
  });
  it('rejects a fabricated variant in native creation', async () => {
    const { service, insert } = setup();
    await expect(
      service.create(owner, { ...request, playbackVariant: { assetId: derivedAssetId } })
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
});

it('uses a compatible prepared layout and adapts its caption preset to each source window before one insert', async () => {
  const { service, prepare, insert } = setup(),
    ref = { id: 'short-con-subtitulos', version: 1 };
  prepare.mockImplementation(async () => ({
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title: 'Short con subtítulos',
    engine: 'remotion',
    canvas: request.canvas,
    durationMs: 4000,
    globalAudio: [],
    styleRef: null,
    brandSnapshot: null,
    assetIds: [],
    scenes: [
      {
        id: crypto.randomUUID(),
        templateRef: ref,
        durationMs: 4000,
        layers: [
          {
            id: crypto.randomUUID(),
            type: 'captions',
            startMs: 0,
            endMs: 4000,
            visible: true,
            zIndex: 0,
            endAnchor: 'scene-end',
            box: { x: 40, y: 80, width: 400, height: 200 },
            templateRef: { id: 'minimal', version: 1 },
            cues: [{ id: 'a', startMs: 0, endMs: 4000, text: 'Texto de muestra' }],
          },
        ],
      },
    ],
  }));
  const [first, second] = await service.create(owner, { ...request, templateRef: ref });
  for (const row of [first!, second!]) {
    const videos = row.document.scenes[0]!.layers.filter((layer) => layer.type === 'video');
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ assetId: source.id, volume: 1, visible: true });
  }
  expect(prepare).toHaveBeenCalledWith(owner, { templateRef: ref, engine: 'remotion' });
  expect(first!.document.scenes[0]).toMatchObject({ templateRef: ref, durationMs: 7000 });
  expect(first!.document.scenes[0]!.layers[1]).toMatchObject({
    type: 'captions',
    endMs: 7000,
    templateRef: { id: 'minimal', version: 1 },
  });
  expect(second!.document.scenes[0]!.layers[1]).toMatchObject({
    type: 'captions',
    endMs: 6000,
    cues: [],
  });
  expect(insert).toHaveBeenCalledTimes(1);
  insert.mockClear();
  await expect(
    service.create(owner, {
      ...request,
      templateRef: ref,
      canvas: { width: 640, height: 360, fps: 25 },
    })
  ).rejects.toThrow(/lienzo/);
  expect(insert).not.toHaveBeenCalled();
});

it('retains only words surviving measured video bounds, including a full-range short', () => {
  const segments = [
    {
      start: 0.5,
      end: 1.2,
      text: 'sí fuera',
      words: [
        { start: 0.5, end: 0.9, word: ' sí' },
        { start: 1.05, end: 1.2, word: ' fuera' },
      ],
    },
    {
      start: 0.9,
      end: 1.2,
      text: 'descartada',
      words: [{ start: 1.05, end: 1.2, word: ' descartada' }],
    },
    { start: 0.7, end: 1.2, text: 'sin alineación' },
    { start: 0.1, end: 0.3, text: 'sí extra', words: [{ start: 0.1, end: 0.3, word: ' sí' }] },
  ];
  const cues = sourceCues(segments, 1000);
  expect(sliceCaptions(cues, { startMs: 0, endMs: 1000 })).toEqual([
    {
      id: 'cue-0',
      startMs: 500,
      endMs: 1000,
      text: 'sí',
      words: [{ text: ' sí', startMs: 0, endMs: 400 }],
    },
    { id: 'cue-2', startMs: 700, endMs: 1000, text: 'sin alineación' },
    {
      id: 'cue-3',
      startMs: 100,
      endMs: 300,
      text: 'sí',
      words: [{ text: ' sí', startMs: 0, endMs: 200 }],
    },
  ]);
});
it('refuses to put the new recording behind an unbound old full-frame video', async () => {
  const { service, prepare, insert } = setup();
  const draft = (await service.create(owner, { ...request, ranges: [request.ranges[0]] }))[0]!
    .document;
  draft.assetIds = ['old'];
  const v = draft.scenes[0]!.layers[0]!;
  if (v.type !== 'video') throw Error('fixture');
  v.assetId = 'old';
  v.sourceInMs = 0;
  prepare.mockResolvedValue(draft);
  insert.mockClear();
  await expect(
    service.create(owner, {
      ...request,
      ranges: [request.ranges[0]],
      templateRef: { id: 'old', version: 1 },
    })
  ).rejects.toThrow();
  expect(insert).not.toHaveBeenCalled();
});
