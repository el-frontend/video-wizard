import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it, vi } from 'vitest';
import {
  descendants,
  processTable,
} from '../../../packages/hyperframes-compositions/src/process-tree';
import { HyperframesProjectAdapter } from './adapter';

// The pinned disk-capture path writes the screenshots and encoder output
// alongside the private destination on macOS and Linux.
function capturedBytes(workspace: string, stage: 'capture' | 'encode') {
  const render = readdirSync(workspace).find((name) => name.startsWith('render-'));
  if (!render) return 0;
  const out = join(workspace, render);
  const work = readdirSync(out).find((name) => name.startsWith('work-'));
  if (!work) return 0;
  const dir = join(out, work);
  for (const ext of ['jpg', 'png']) {
    const frame = statSync(join(dir, 'captured-frames', 'frame_000001.' + ext), {
      throwIfNoEntry: false,
    });
    if (frame?.size) {
      return stage === 'capture'
        ? frame.size
        : (statSync(join(dir, 'video-only.mp4'), { throwIfNoEntry: false })?.size ?? 0);
    }
  }
  return 0;
}

const native = (import.meta as ImportMeta & { env: { MODE: string } }).env.MODE === 'native';
it.skipIf(!native || process.platform === 'win32')(
  'cancels the owned native processes during frame capture and video encoding',
  async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'studio-native-cancel-'));
    const adapter = new HyperframesProjectAdapter(workspace);
    const durationMs = 8000;
    const ownerId = randomUUID();
    const pattern = join(workspace, 'pattern.mp4');
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=960x540:r=25:d=8,noise=alls=18:all_seed=17:allf=t+u',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      pattern,
    ]);
    const patternBytes = await readFile(pattern);
    const hash = createHash('sha256').update(patternBytes).digest('hex');
    const store = join(workspace, 'assets', ownerId);
    await mkdir(store, { recursive: true });
    await writeFile(join(store, hash), patternBytes);
    const prepared = await adapter.prepare(
      {
        ownerId,
        revision: 'cancel',
        diagnostics: [],
        bundles: {},
        dependencies: {
          assets: {
            pattern: {
              id: 'pattern',
              name: 'pattern',
              hash,
              url: 'media/' + hash,
              mediaType: 'video/mp4',
              durationMs,
              hasAudio: false,
              width: 960,
              height: 540,
            },
          },
          libraries: {},
        },
        document: {
          schemaVersion: 1,
          id: 'cancel',
          title: 'Cancelación',
          engine: 'hyperframes',
          canvas: { width: 960, height: 540, fps: 25 },
          durationMs,
          styleRef: null,
          brandSnapshot: null,
          assetIds: ['pattern'],
          globalAudio: [],
          scenes: [
            {
              id: 'capture',
              durationMs,
              layers: [
                {
                  type: 'video',
                  sourceInMs: 0,
                  volume: 0,
                  fit: 'cover',
                  focalPoint: { x: 0.5, y: 0.5 },
                  assetId: 'pattern',
                  id: 'picture',
                  visible: true,
                  zIndex: 0,
                  startMs: 0,
                  endMs: durationMs,
                  endAnchor: 'fixed',
                  box: { x: 0, y: 0, width: 960, height: 540 },
                },
              ],
            },
          ],
        },
      },
      workspace
    );
    const results = [];
    // Separate stages let us observe each real binary's work without reading argv.
    vi.stubEnv('PRODUCER_LOW_MEMORY_MODE', 'true');
    vi.stubEnv('PRODUCER_ENABLE_STREAMING_ENCODE', 'false');
    try {
      for (const stage of ['capture', 'encode'] as const) {
        const controller = new AbortController();
        const reason = new Error('Aborto de la prueba durante ' + stage);
        const outcome = adapter
          .render(prepared, { signal: controller.signal, onProgress() {} })
          .then(
            () => 'completed',
            (error: unknown) => error
          );
        const earlyExit = outcome.then((result) => {
          const detail =
            result === 'completed'
              ? 'completado'
              : String(result)
                  .match(/"code":\s*"[a-z0-9_-]+"|low disk space|strict check failed/gi)
                  ?.slice(0, 12)
                  .join(' ') || 'fallo del CLI';
          throw new Error('El render terminó antes de ' + stage + ' (' + detail + ')');
        });
        let owned: ReturnType<typeof descendants> = [];
        let targetCount = 0,
          bytes = 0;
        try {
          const deadline = Date.now() + 60000;
          while (Date.now() < deadline) {
            bytes = capturedBytes(workspace, stage);
            // FFmpeg writes a 48-byte MP4 header before encoding any frame.
            if (bytes > (stage === 'encode' ? 4096 : 0)) {
              const table = processTable();
              // Linux comm can truncate chromium-headless-shell to chromium-headle.
              const target = stage === 'capture' ? /chrome|chromium|headless_shell/i : /ffmpeg/i;
              for (const cli of table.filter(
                (p) => p.parent === process.pid && p.pid === p.group
              )) {
                const tree = descendants(cli.pid, table);
                targetCount = tree.filter((p) => target.test(p.name)).length;
                if (targetCount) {
                  owned = [cli, ...tree];
                  break;
                }
              }
              if (owned.length) break;
            }
            await Promise.race([delay(15), earlyExit]);
          }
          expect(targetCount, 'Procesos activos durante ' + stage).toBeGreaterThan(0);
        } finally {
          controller.abort(reason);
          await outcome;
        }
        expect(await outcome).toBe(reason);
        const groups = new Set(owned.map((p) => p.group));
        await vi.waitFor(
          () => {
            const remaining = processTable().filter(
              (p) =>
                groups.has(p.group) ||
                owned.some((before) => before.pid === p.pid && before.name === p.name)
            );
            expect(remaining.length).toBe(0);
          },
          { timeout: 3000 }
        );
        expect(
          (await readdir(workspace)).filter((f) => f.startsWith('render-') || f === 'video.mp4')
        ).toEqual([]);
        results.push({ stage, bytes, targetCount, processes: owned.length, groups: groups.size });
      }
    } finally {
      vi.unstubAllEnvs();
    }
    const evidence = resolve(
      process.env.STUDIO_NATIVE_EVIDENCE_DIR ||
        '../../.superpowers/sdd/2026-11-18-video-wizard-03-generacion/r2-evidence'
    );
    await mkdir(evidence, { recursive: true });
    await writeFile(join(evidence, 'real-cancel.json'), JSON.stringify(results, null, 2));
  },
  150000
);
