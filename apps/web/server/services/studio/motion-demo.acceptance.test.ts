import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { authFixture } from '@/server/auth/auth-test-fixture';
import { users } from '@/server/db/schema';
import { stylePackFonts } from '@workspace/style-packs';
import { AssetService } from './asset-service';
import { ImportService } from './import-service';
import { provisionCatalog } from './provision-catalog';

it.runIf((import.meta as ImportMeta & { env: { MODE: string } }).env.MODE === 'import-demo')(
  'preserves the operator-selected Motion Studio demo and verifies unchanged source bytes',
  async () => {
    const root = process.env.STUDIO_DEMO_ROOT || resolve('../../../..'),
      slug = 'studio-demo-noticias';
    const source = join(root, 'videos', slug),
      state = join(root, '.studio/projects', slug, 'state.json');
    const episode = JSON.parse(await readFile(join(source, 'episode.json'), 'utf8')) as {
      audioMaster?: string;
      scenes: { duration: number; titleLines?: string[]; narration?: string; audio?: string }[];
    };
    const captions = JSON.parse(await readFile(join(source, 'captions.json'), 'utf8')) as {
      start: number;
      end: number;
      text: string;
    }[];
    const meta = JSON.parse(await readFile(state, 'utf8')) as {
      styleId: string;
      audioBindings: Record<string, string>;
    };
    const voices = [
      ...new Set(
        [episode.audioMaster, ...episode.scenes.map((s) => s.audio)].filter((v): v is string => !!v)
      ),
    ];
    const files = [
      join(source, 'episode.json'),
      join(source, 'captions.json'),
      join(source, 'frame.md'),
      state,
      ...voices.map((v) => join(source, v)),
      join(root, 'styles', meta.styleId, 'frame.md'),
      ...stylePackFonts.map((f) => join(root, 'styles', meta.styleId, 'assets/fonts', f.filename)),
    ];
    async function hashes() {
      return Promise.all(
        files.map(async (f) =>
          createHash('sha256')
            .update(await readFile(f))
            .digest('hex')
        )
      );
    }
    const before = await hashes(),
      fixture = await authFixture(9),
      data = await mkdtemp(join(tmpdir(), 'd6-demo-assets-')),
      owner = randomUUID();
    vi.stubEnv('STUDIO_DATA_DIR', data);
    try {
      await fixture.db.insert(users).values({ id: owner, email: owner + '@example.test' });
      await provisionCatalog(fixture.db, owner);
      const imports = new ImportService(fixture.db, {
        sources: [{ ownerId: owner, sourceId: 'demo', root, slug, fps: 30 }],
        dataDir: data,
      });
      const { project, diagnostics } = await imports.import(owner, {
        kind: 'motion-studio',
        sourceId: 'demo',
      });
      const doc = project.document;
      expect(doc.engine).toBe('hyperframes');
      expect(doc.styleRef?.id).toBe(meta.styleId);
      expect(doc.scenes).toHaveLength(episode.scenes.length);
      let sum = 0,
        cueCount = 0;
      for (let i = 0; i < doc.scenes.length; i++) {
        const scene = doc.scenes[i]!,
          original = episode.scenes[i]!,
          start = Math.round(sum * 1000);
        sum += original.duration;
        const end = Math.round(sum * 1000);
        expect(scene.durationMs).toBe(end - start);
        expect(scene.editorial?.headline).toBe(original.titleLines?.join('\n'));
        expect(scene.editorial?.narration === original.narration).toBe(true);
        const expected = captions.flatMap((c) => {
          const a = Math.max(start, Math.round(c.start * 1000)),
            b = Math.min(end, Math.round(c.end * 1000));
          return b > a ? [[c.text, a - start, b - start]] : [];
        });
        const actual = scene.layers.flatMap((l) =>
          l.type === 'captions' ? l.cues.map((c) => [c.text, c.startMs, c.endMs]) : []
        );
        expect(actual).toEqual(expected);
        cueCount += actual.length;
      }
      expect(doc.durationMs).toBe(Math.round(sum * 1000));
      const assets = new AssetService(fixture.db, data);
      const managed = await Promise.all(doc.assetIds.map((id) => assets.get(owner, id)));
      for (const voice of voices) {
        const expected = createHash('sha256')
          .update(await readFile(join(source, voice)))
          .digest('hex');
        expect(managed.some((a) => a.hash === expected)).toBe(true);
      }
      const narration = project.importContext!.narration!;
      expect(narration.takes).toHaveLength(episode.scenes.filter((s) => s.audio).length);
      for (const t of narration.takes) {
        const i = doc.scenes.findIndex((s) => s.id === t.sceneId),
          audio = episode.scenes[i]!.audio!;
        expect(t.spokenText === meta.audioBindings[audio]).toBe(true);
      }
      expect(
        (doc.globalAudio.length === 1 &&
          !doc.scenes.some((s) => s.layers.some((l) => l.type === 'audio'))) ||
          (doc.globalAudio.length === 0 && narration.playback === 'scenes')
      ).toBe(true);
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const after = await hashes();
      expect(after).toEqual(before);
      console.info(
        'Verified Motion capture',
        JSON.stringify({
          files: before.length,
          sourceDigest: createHash('sha256').update(JSON.stringify(before)).digest('hex'),
          importHash: project.importContext!.hash,
          scenes: doc.scenes.length,
          durationMs: doc.durationMs,
          captions: cueCount,
          voiceAssets: voices.length,
          playback: narration.playback,
          style: doc.styleRef,
          diagnostics: diagnostics.map((d) => d.code),
        })
      );
    } finally {
      vi.unstubAllEnvs();
      await fixture.close();
      await rm(data, { recursive: true, force: true });
    }
  },
  60000
);
