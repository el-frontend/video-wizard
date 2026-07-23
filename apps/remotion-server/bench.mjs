/**
 * Remotion render performance benchmark harness (issue #6).
 *
 * Bundles the real `VideoWithSubtitles` composition once, serves a local
 * sample video over HTTP (mirroring the production path where the source is
 * fetched from the processing-engine over HTTP), then times renderMedia()
 * under a baseline config (exactly what render-queue.ts passes today) versus
 * several optimization variants — in isolation, one variable at a time.
 *
 * Usage: node bench.mjs
 */
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, ensureBrowser } from '@remotion/renderer';
import { createServer } from 'node:http';
import { statSync, createReadStream, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORES = os.cpus().length;

// --- Config -----------------------------------------------------------------
const SAMPLE_VIDEO = path.resolve(
  __dirname,
  '../processing-engine/output/A999_11151216_C035_clip_0s.mp4'
);
const OUT_DIR = path.join(os.tmpdir(), 'remotion-bench-renders');
const VIDEO_PORT = 4599;
const DURATION_FRAMES = 300; // fixed 10s @ 30fps so every config renders identical work
const TEMPLATE = 'viral';
const GB = 1024 * 1024 * 1024;

// Generate ~10s of subtitles in SECONDS (composition expects seconds).
const subtitles = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  start: i,
  end: i + 1,
  text: `This is benchmark subtitle segment number ${i + 1} for testing`,
}));

const inputProps = {
  videoUrl: `http://localhost:${VIDEO_PORT}/video.mp4`,
  subtitles,
  template: TEMPLATE,
  language: 'en',
  aspectRatio: '9:16',
  backgroundColor: '#000000',
  durationInFrames: DURATION_FRAMES,
};

// Each config layers optimizations onto the baseline render options.
// baseline mirrors render-queue.ts exactly: only codec is set.
const CONFIGS = [
  // Single-variable isolation (one option added per row).
  { name: 'baseline (current)', opts: {} },
  { name: '+ concurrency=cores', opts: { concurrency: CORES } },
  { name: '+ x264Preset=veryfast', opts: { x264Preset: 'veryfast' } },
  { name: '+ offthreadCache=2GB', opts: { offthreadVideoCacheSizeInBytes: 2 * GB } },
  // gl is platform-specific: swangle was ~2x slower on macOS; test on Linux.
  { name: '+ gl=swangle', opts: { chromiumOptions: { gl: 'swangle' } } },
  // Recommended stack (no gl override, no forced concurrency).
  { name: 'RECOMMENDED (veryfast+cache)', opts: { x264Preset: 'veryfast', offthreadVideoCacheSizeInBytes: 2 * GB } },
  { name: 'ultrafast+cache', opts: { x264Preset: 'ultrafast', offthreadVideoCacheSizeInBytes: 2 * GB } },
];

// --- Static video server ----------------------------------------------------
function startVideoServer() {
  const size = statSync(SAMPLE_VIDEO).size;
  const server = createServer((req, res) => {
    const range = req.headers.range;
    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': 'video/mp4',
      });
      createReadStream(SAMPLE_VIDEO, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': size, 'Content-Type': 'video/mp4' });
      createReadStream(SAMPLE_VIDEO).pipe(res);
    }
  });
  return new Promise((resolve) => server.listen(VIDEO_PORT, () => resolve(server)));
}

const ms = (ns) => Number(ns) / 1e6;
const now = () => process.hrtime.bigint();

async function timeRender(label, serveUrl, composition, opts) {
  const out = path.join(OUT_DIR, `${label.replace(/[^a-z0-9]/gi, '_')}.mp4`);
  const t0 = now();
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: 'h264',
    outputLocation: out,
    onProgress: () => {}, // no-op, kept identical across configs
    logLevel: 'error',
    ...opts,
  });
  return ms(now() - t0) / 1000; // seconds
}

async function main() {
  console.log(`\n=== Remotion render benchmark ===`);
  console.log(`Machine: ${CORES} cores, ${os.platform()} ${os.arch()}, ${(os.totalmem() / GB).toFixed(1)}GB RAM`);
  console.log(`Sample: ${path.basename(SAMPLE_VIDEO)} (${(statSync(SAMPLE_VIDEO).size / 1024 / 1024).toFixed(1)}MB)`);
  console.log(`Render target: 1080x1920, ${DURATION_FRAMES} frames @30fps (10s), template=${TEMPLATE}\n`);

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  await ensureBrowser();
  const server = await startVideoServer();

  // Cold-start cost: bundle (mirrors index.ts bundling on server startup).
  let t = now();
  const serveUrl = await bundle({
    entryPoint: path.resolve(__dirname, '../../packages/remotion-compositions/src/index.ts'),
  });
  const bundleSec = ms(now() - t) / 1000;
  console.log(`Bundle (cold-start, once per server boot): ${bundleSec.toFixed(1)}s`);

  // Per-job composition selection cost (browser launch + calculateMetadata).
  t = now();
  const composition = await selectComposition({ serveUrl, id: 'VideoWithSubtitles', inputProps });
  const selectSec = ms(now() - t) / 1000;
  console.log(`selectComposition (per job): ${selectSec.toFixed(1)}s`);
  console.log(`Resolved: ${composition.width}x${composition.height}, ${composition.durationInFrames} frames\n`);

  // Warmup render (discarded) so disk/OS caches are warm and the first real
  // config isn't penalized.
  process.stdout.write('warmup render... ');
  const warm = await timeRender('warmup', serveUrl, composition, {});
  console.log(`${warm.toFixed(1)}s (discarded)\n`);

  const results = [];
  for (const cfg of CONFIGS) {
    process.stdout.write(`${cfg.name.padEnd(24)} ... `);
    const sec = await timeRender(cfg.name, serveUrl, composition, cfg.opts);
    console.log(`${sec.toFixed(1)}s`);
    results.push({ name: cfg.name, sec });
  }

  // Re-run baseline to gauge drift/variance.
  process.stdout.write(`baseline (re-run/drift)  ... `);
  const drift = await timeRender('baseline_rerun', serveUrl, composition, {});
  console.log(`${drift.toFixed(1)}s\n`);

  const base = results[0].sec;
  console.log('=== RESULTS (render-only, 10s clip) ===');
  console.log('config'.padEnd(26) + 'time'.padEnd(10) + 'vs baseline');
  for (const r of results) {
    const speedup = ((base - r.sec) / base) * 100;
    const tag = r.name === 'baseline (current)' ? '—' : `${speedup >= 0 ? '-' : '+'}${Math.abs(speedup).toFixed(0)}%`;
    console.log(r.name.padEnd(26) + `${r.sec.toFixed(1)}s`.padEnd(10) + tag);
  }
  console.log(`\nbaseline drift: ${base.toFixed(1)}s -> ${drift.toFixed(1)}s (${(((drift - base) / base) * 100).toFixed(0)}%)`);
  console.log(`\nJSON: ${JSON.stringify({ machine: { cores: CORES }, bundleSec, selectSec, results, drift })}`);

  server.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('Benchmark failed:', e);
  process.exit(1);
});
