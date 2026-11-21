import { describe, expect, it, vi } from 'vitest';
import { initialTemplates } from './initial-templates';
import { TemplateService } from './template-service';
import type { LibraryEntry, ProjectDraft, ProjectRecord } from '@workspace/video-project';

function setup() {
  const [template] = initialTemplates();
  const entries: LibraryEntry[] = [
    template!,
    {
      kind: 'component',
      id: 'minimal',
      version: 1,
      name: 'Minimalista',
      assetIds: [],
      engine: 'remotion',
      manifest: { version: 1, props: {}, builtin: { kind: 'remotion-caption', preset: 'minimal' } },
    },
  ];
  const insert = vi.fn(
    async (ownerId: string, document: ProjectDraft): Promise<ProjectRecord> => ({
      ownerId,
      document,
      revision: 'revision',
      updatedAt: new Date().toISOString(),
    })
  );
  const library = {
    verifiedComponent: vi.fn(async () => true),
    get: vi.fn(async (_owner: string, ref: { id: string; version: number }) => {
      const row = entries.find((e) => e.id === ref.id && e.version === ref.version);
      if (!row) throw Error('missing ' + ref.id);
      return row;
    }),
    publish: vi.fn(async (_owner: string, entry: LibraryEntry) => entry),
  };
  const projects = { createFromDocument: insert, get: vi.fn() };
  const assets = {
    get: vi.fn(async (_owner: string, id: string) => ({
      id,
      ownerId: 'owner',
      name: id,
      locator: 'private',
      mediaType: id === 'foto' ? 'image/png' : 'audio/wav',
      hash: 'a'.repeat(64),
      hasAudio: true,
      durationMs: 4000,
    })),
  };
  return {
    service: new TemplateService(library, projects, assets),
    library,
    assets,
    template: template!,
    insert,
    entries,
    projects,
  };
}
describe('editable templates', () => {
  it('creates fresh scenes, layers and cues, applies slot text and preserves external pins', async () => {
    const { service, template } = setup();
    const input = {
      templateRef: { id: template.id, version: template.version },
      engine: 'remotion',
      content: { subtitulo: 'Prueba de edición' },
    };
    const first = (await service.instantiate('owner', input)).document;
    const second = (await service.instantiate('owner', input)).document;
    const a = first.scenes[0]!,
      b = second.scenes[0]!;
    expect(a.id).not.toBe(b.id);
    expect(first.id).not.toBe(second.id);
    const one = a.layers.find((l) => l.type === 'captions')!,
      two = b.layers.find((l) => l.type === 'captions')!;
    expect(one.id).not.toBe(two.id);
    expect(one.cues[0]!.id).not.toBe(two.cues[0]!.id);
    expect(one.cues[0]!.text).toBe('Prueba de edición');
    expect(one.templateRef).toEqual(two.templateRef);
    one.cues[0]!.text = 'edición local';
    expect(two.cues[0]!.text).toBe('Prueba de edición');
    expect(JSON.stringify(template)).not.toContain('edición local');
  });
  it('rejects invalid content and incompatible engines before inserting anything', async () => {
    const { service, template, insert } = setup();
    const templateRef = { id: template.id, version: 1 };
    for (const input of [
      { engine: 'remotion', content: { error: 'x' } },
      { engine: 'remotion', content: { subtitulo: 8 } },
      { engine: 'hyperframes', content: {} },
    ])
      await expect(service.instantiate('owner', { templateRef, ...input })).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
  it('validates required slots, remaps global audio and invalidates timings only for replaced content', async () => {
    const { service, template, insert } = setup();
    const structure = template.structure!,
      scene = structure.scenes[0]!;
    const layer = scene.layers[0]!;
    if (layer.type !== 'captions') throw Error('fixture');
    layer.sourceAudioLayerId = 'global';
    layer.cues[0]!.words = [{ text: 'Una', startMs: 0, endMs: 100 }];
    const audio = {
      type: 'audio' as const,
      id: 'global',
      assetId: 'original',
      volume: 1,
      sourceInMs: 0,
      zIndex: 0,
      visible: true,
      startMs: 0,
      endMs: 4000,
      endAnchor: 'fixed' as const,
    };
    structure.globalAudio = [audio];
    scene.layers.push({
      ...audio,
      id: 'toma',
      take: { provider: 'manual', durationMs: 4000, spokenText: 'Texto anterior', stale: false },
    });
    template.assetIds = ['original'];
    scene.editorial = { narration: 'Texto anterior' };
    structure.slots.narracion = { field: 'narration', sceneId: scene.id };
    template.manifest.props.narracion = { type: 'string', required: true };
    const input = { templateRef: { id: template.id, version: 1 }, engine: 'remotion' };
    await expect(service.instantiate('owner', { ...input, content: {} })).rejects.toThrow(
      /obligatorios/
    );
    expect(insert).not.toHaveBeenCalled();
    const auto = (
      await service.instantiate('owner', { ...input, content: { narracion: 'Otro texto' } })
    ).document;
    const c = auto.scenes[0]!.layers.find((l) => l.type === 'captions')!,
      a = auto.scenes[0]!.layers.find((l) => l.type === 'audio')!;
    expect(auto.globalAudio[0]!.id).not.toBe('global');
    expect(c.sourceAudioLayerId).toBe(auto.globalAudio[0]!.id);
    expect(a.take?.stale).toBe(true);
    expect(c.cues[0]!.words).toEqual(layer.cues[0]!.words);
    const changed = (
      await service.instantiate('owner', {
        ...input,
        content: { subtitulo: 'Edición', narracion: 'Texto anterior' },
      })
    ).document;
    expect(
      changed.scenes[0]!.layers.find((l) => l.type === 'captions')!.cues[0]!.words
    ).toBeUndefined();
    expect(layer.cues[0]!.words).toHaveLength(1);
  });
  it('checks substituted media, legacy metadata, undeclared targets and pinned implementations before insert', async () => {
    const { service, template, insert, library } = setup();
    const structure = template.structure!,
      scene = structure.scenes[0]!;
    scene.layers.push({
      type: 'image',
      id: 'imagen',
      assetId: 'foto',
      box: { x: 0, y: 0, width: 60, height: 60 },
      startMs: 0,
      endMs: 4000,
      endAnchor: 'scene-end',
      visible: true,
      zIndex: 1,
    });
    template.assetIds = ['foto'];
    structure.slots.imagen = { field: 'asset', layerId: 'imagen', sceneId: scene.id };
    template.manifest.props.imagen = { type: 'string' };
    const input = {
      templateRef: { id: template.id, version: 1 },
      engine: 'remotion',
      content: { imagen: 'otro-audio' },
    };
    await expect(service.instantiate('owner', input)).rejects.toThrow(/compatible/);
    library.verifiedComponent.mockResolvedValueOnce(false);
    await expect(service.instantiate('owner', { ...input, content: {} })).rejects.toThrow(
      /verificada/
    );
    delete template.manifest.props.imagen;
    await expect(service.instantiate('owner', { ...input, content: {} })).rejects.toThrow(
      /destino/
    );
    delete template.structure;
    await expect(service.instantiate('owner', input)).rejects.toThrow(/estructura editable/);
    expect(insert).not.toHaveBeenCalled();
  });
  it('publishes only the saved composition, validates the owner and revision, and removes past scene provenance', async () => {
    const { service, template, projects, library } = setup();
    const record = await service.instantiate('owner', {
      templateRef: { id: template.id, version: 1 },
      engine: 'remotion',
      content: {},
    });
    projects.get.mockResolvedValue(record);
    await expect(
      service.fromProject('owner', record.document.id, { baseRevision: 'old', name: 'Boletín' })
    ).rejects.toMatchObject({ current: record });
    expect(library.publish).not.toHaveBeenCalled();
    const entry = await service.fromProject('owner', record.document.id, {
      baseRevision: record.revision,
      name: 'Boletín',
    });
    expect(projects.get).toHaveBeenCalledWith('owner', record.document.id);
    expect(entry.kind).toBe('template');
    if (entry.kind !== 'template') throw Error('fixture');
    expect(entry.structure!.scenes[0]!.templateRef).toBeUndefined();
    expect(entry).not.toHaveProperty('ownerId');
    expect(entry.structure).not.toHaveProperty('brandSnapshot');
  });
});
