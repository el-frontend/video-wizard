/**
 * Phase 2 verification: prove the bounded concurrent queue actually runs
 * multiple renders in parallel, never exceeds MAX_CONCURRENT_RENDERS, and
 * drains every job to completion.
 *
 * Run: MAX_CONCURRENT_RENDERS=2 npx tsx verify-queue.ts
 */
import { bundle } from '@remotion/bundler';
import { ensureBrowser } from '@remotion/renderer';
import { mkdtemp, copyFile, mkdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { assetPath, fileHash } from '@workspace/render-contract/storage';
import { hostRenderBundle, bundlePublicPath } from './server/render-bundle-host.js';
import os from 'node:os';
import path from 'node:path';

import { makeRenderQueue } from './server/render-queue.js';

const EXPECTED_LIMIT = Number(process.env.MAX_CONCURRENT_RENDERS ?? 1);
const JOB_COUNT = 3;

// Any local mp4 works. `apps/processing-engine/output/` is gitignored, so
// point SAMPLE_VIDEO at a file you have.
const SAMPLE = path.resolve(
  process.env.SAMPLE_VIDEO ?? '../processing-engine/output/A999_11151216_C035_clip_0s.mp4'
);
async function main() {
  console.log(`\n=== Phase 2 queue verification ===`);
  console.log(`MAX_CONCURRENT_RENDERS=${EXPECTED_LIMIT}, enqueuing ${JOB_COUNT} jobs\n`);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'studio-queue-'));
  process.env.STUDIO_DATA_DIR = directory;
  const ownerId = randomUUID(),
    hash = await fileHash(SAMPLE, new AbortController().signal);
  await copyFile(SAMPLE, await assetPath(directory, ownerId, hash, true));
  const rendersDir = path.join(directory, 'renders');
  await mkdir(rendersDir);
  await ensureBrowser({ browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE });
  const bundleDir = await bundle({
    entryPoint: path.resolve('../../packages/remotion-compositions/src/entry.ts'),
    publicPath: bundlePublicPath,
  });
  const bundleHost = await hostRenderBundle(bundleDir);
  const queue = makeRenderQueue({ serveUrl: bundleHost.url, rendersDir });
  const jobIds = Array.from({ length: JOB_COUNT }, () =>
    queue.createJob({
      ownerId,
      admission: {
        compositionId: 'VideoWithSubtitles',
        webJobId: randomUUID(),
        sourceAsset: { assetId: randomUUID(), hash, mediaType: 'video/mp4', durationMs: 2000 },
        inputProps: {
          subtitles: [],
          template: 'viral',
          language: 'es',
          aspectRatio: '9:16',
          backgroundColor: '#000000',
          durationInFrames: 60,
        },
      },
    })
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

  bundleHost.close();
  await rm(directory, { recursive: true, force: true });
  process.exit(drained && bounded && parallel ? 0 : 1);
}

main().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
