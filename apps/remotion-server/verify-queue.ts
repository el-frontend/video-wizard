/**
 * Phase 2 verification: prove the bounded concurrent queue actually runs
 * multiple renders in parallel, never exceeds MAX_CONCURRENT_RENDERS, and
 * drains every job to completion.
 *
 * Run: MAX_CONCURRENT_RENDERS=2 npx tsx verify-queue.ts
 */
import { bundle } from '@remotion/bundler';
import { ensureBrowser } from '@remotion/renderer';
import { createReadStream, mkdirSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { makeRenderQueue } from './server/render-queue.js';

const EXPECTED_LIMIT = Number(process.env.MAX_CONCURRENT_RENDERS ?? 1);
const JOB_COUNT = 3;
const VIDEO_PORT = 4601;
// Any local mp4 works. `apps/processing-engine/output/` is gitignored, so
// point SAMPLE_VIDEO at a file you have.
const SAMPLE = path.resolve(
  process.env.SAMPLE_VIDEO ?? '../processing-engine/output/A999_11151216_C035_clip_0s.mp4'
);
const OUT_DIR = path.join(os.tmpdir(), 'remotion-queue-verify');

function startVideoServer() {
  const size = statSync(SAMPLE).size;
  const server = createServer((req, res) => {
    const range = req.headers.range;
    if (range) {
      const [s, e] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(s, 10);
      const end = e ? parseInt(e, 10) : size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': 'video/mp4',
      });
      createReadStream(SAMPLE, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': size, 'Content-Type': 'video/mp4' });
      createReadStream(SAMPLE).pipe(res);
    }
  });
  return new Promise<ReturnType<typeof createServer>>((resolve) =>
    server.listen(VIDEO_PORT, () => resolve(server))
  );
}

async function main() {
  console.log(`\n=== Phase 2 queue verification ===`);
  console.log(`MAX_CONCURRENT_RENDERS=${EXPECTED_LIMIT}, enqueuing ${JOB_COUNT} jobs\n`);

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  await ensureBrowser();
  const videoServer = await startVideoServer();

  const serveUrl = await bundle({
    entryPoint: path.resolve('../../packages/remotion-compositions/src/index.ts'),
  });

  const queue = makeRenderQueue({
    port: 3001,
    serveUrl,
    rendersDir: OUT_DIR,
    publicUrl: 'http://localhost:3001',
  });

  // Short renders (60 frames = 2s) so the test finishes quickly.
  const inputProps = {
    videoUrl: `http://localhost:${VIDEO_PORT}/video.mp4`,
    subtitles: [{ id: 1, start: 0, end: 2, text: 'queue verification' }],
    template: 'viral',
    language: 'en',
    aspectRatio: '9:16',
    backgroundColor: '#000000',
    durationInFrames: 60,
  };

  const jobIds = Array.from({ length: JOB_COUNT }, () =>
    queue.createJob({ compositionId: 'VideoWithSubtitles', inputProps })
  );

  // Sample the queue and record peak simultaneous in-progress renders.
  let peak = 0;
  const sampler = setInterval(() => {
    let inProgress = 0;
    for (const id of jobIds) {
      if (queue.jobs.get(id)?.status === 'in-progress') inProgress++;
    }
    peak = Math.max(peak, inProgress);
  }, 50);

  const start = Date.now();
  while (Date.now() - start < 300_000) {
    const states = jobIds.map((id) => queue.jobs.get(id)?.status);
    if (states.every((s) => s === 'completed' || s === 'failed')) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  clearInterval(sampler);

  const finalStates = jobIds.map((id) => queue.jobs.get(id)?.status);
  const completed = finalStates.filter((s) => s === 'completed').length;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n--- Results ---`);
  console.log(`states:            ${finalStates.join(', ')}`);
  console.log(`completed:         ${completed}/${JOB_COUNT}`);
  console.log(`peak concurrent:   ${peak} (limit ${EXPECTED_LIMIT})`);
  console.log(`wall clock:        ${elapsed}s`);

  const drained = completed === JOB_COUNT;
  const bounded = peak <= EXPECTED_LIMIT;
  const parallel = EXPECTED_LIMIT === 1 || peak > 1;

  console.log(`\ndrained all jobs:  ${drained ? 'PASS' : 'FAIL'}`);
  console.log(`respected limit:   ${bounded ? 'PASS' : 'FAIL'}`);
  console.log(`ran in parallel:   ${parallel ? 'PASS' : 'FAIL'}`);

  videoServer.close();
  process.exit(drained && bounded && parallel ? 0 : 1);
}

main().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
