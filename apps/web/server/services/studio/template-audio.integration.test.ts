import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openStudioTestDb } from '@/test/studio-db';
import { AssetService } from './asset-service';
import { LibraryService } from './library-service';
import { ProjectService } from './project-service';
import { TemplateService } from './template-service';

it('reopens audio slot instances with take provenance only for the original recording', async () => {
  const fixture = await openStudioTestDb();
  const dir = await mkdtemp(join(tmpdir(), 'studio-template-audio-'));
  try {
    const owner = await fixture.createOwner();
    const assets = new AssetService(fixture.db, dir);
    const projects = new ProjectService(fixture.db);
    const templates = new TemplateService(new LibraryService(fixture.db, dir), projects, assets);
    async function recording(seconds: number) {
      const filename = seconds + 's.wav',
        path = join(dir, filename);
      execFileSync(
        'ffmpeg',
        [
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=220:duration=' + seconds,
          '-ar',
          '16000',
          path,
        ],
        { timeout: 15000 }
      );
      return assets.ingest(owner, {
        filename,
        mediaType: 'audio/wav',
        stream: createReadStream(path),
      });
    }
    const original = await recording(4),
      replacement = await recording(2);
    expect(original.durationMs).toBe(4000);
    expect(replacement.durationMs).toBe(2000);
    const take = {
      durationMs: original.durationMs!,
      provider: 'archivo',
      spokenText: 'Texto de ensayo',
      stale: false,
    };
    const timing = { startMs: 230, endMs: 3200, sourceInMs: 175, endAnchor: 'fixed' as const };
    const template = await templates.publish(owner, {
      kind: 'template',
      id: 'prueba-de-toma',
      version: 1,
      name: 'Toma y duración',
      assetIds: [original.id],
      engine: 'remotion',
      manifest: { version: 1, props: { voz: { type: 'string' } } },
      structure: {
        version: 1,
        canvas: { width: 640, height: 360, fps: 25 },
        styleRef: null,
        globalAudio: [],
        scenes: [
          {
            id: 'escena',
            durationMs: 4000,
            editorial: { narration: take.spokenText },
            layers: [
              {
                type: 'audio',
                id: 'toma',
                assetId: original.id,
                ...timing,
                zIndex: 0,
                visible: true,
                volume: 1,
                take,
              },
            ],
          },
        ],
        slots: { voz: { field: 'asset', sceneId: 'escena', layerId: 'toma' } },
      },
    });
    async function reopen(content: Record<string, string>) {
      const record = await templates.instantiate(owner, {
        templateRef: { id: template.id, version: template.version },
        engine: 'remotion',
        content,
      });
      const { document } = await projects.get(owner, record.document.id);
      expect(document.scenes[0]!.durationMs).toBe(4000);
      return document.scenes[0]!.layers.find((layer) => layer.type === 'audio')!;
    }
    const changed = await reopen({ voz: replacement.id });
    expect(changed).toMatchObject({ ...timing, assetId: replacement.id });
    expect(changed.take).toBeUndefined();
    expect(await reopen({})).toMatchObject({ ...timing, assetId: original.id, take });
    expect(await reopen({ voz: original.id })).toMatchObject({
      ...timing,
      assetId: original.id,
      take,
    });
  } finally {
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
