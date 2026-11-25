import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { mixSoundtrack } from './soundtrack';

const src = 'media/delayed.mp4';
let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'soundtrack-pts-'));
  await mkdir(join(directory, 'media'));
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=size=64x64:duration=1.5:rate=30',
    '-itsoffset',
    '0.5',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=1000:sample_rate=48000:duration=0.2',
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    join(directory, src),
  ]);
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

function rms(pcm: Buffer, ms: number) {
  const first = ms * 48,
    count = 40 * 48;
  let sum = 0;
  for (let i = first; i < first + count; i++) sum += pcm.readFloatLE(i * 4) ** 2;
  return Math.sqrt(sum / count);
}

// On the container clock the tone spans 500–700 ms. Each window below is 40 ms.
it.each([
  {
    cut: 'starts before the stream',
    sourceInMs: 100,
    startMs: 0,
    span: 1000,
    silent: [50, 150, 700],
    audible: [425, 525],
  },
  {
    cut: 'ends during the tone',
    sourceInMs: 100,
    startMs: 175,
    span: 500,
    silent: [200, 520, 680],
    audible: [585, 630],
  },
  {
    cut: 'starts during the tone',
    sourceInMs: 550,
    startMs: 225,
    span: 95,
    silent: [180, 325],
    audible: [250],
  },
  {
    cut: 'ends before the stream',
    sourceInMs: 100,
    startMs: 125,
    span: 250,
    silent: [130, 260, 540],
    audible: [],
  },
  {
    cut: 'starts after the stream',
    sourceInMs: 800,
    startMs: 250,
    span: 300,
    silent: [250, 400],
    audible: [],
  },
])(
  'keeps audio on the container clock when the layer $cut',
  async ({ sourceInMs, startMs, span, silent, audible }) => {
    const mix = await mixSoundtrack(
      new Map([['video', { startMs, durationMs: span, audioOnly: false }]]),
      new Map([['video', { src, sourceInMs, volume: 1 }]]),
      1200,
      directory,
      new AbortController().signal,
      async () => 1
    );
    const pcm = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      join(directory, mix.src),
      '-ac',
      '1',
      '-f',
      'f32le',
      'pipe:1',
    ]);
    expect(pcm.length).toBe(1200 * 48 * 4);
    for (const ms of silent)
      expect.soft(rms(pcm, ms), 'silence at ' + ms + ' ms').toBeLessThan(0.002);
    for (const ms of audible)
      expect.soft(rms(pcm, ms), 'tone at ' + ms + ' ms').toBeCloseTo(0.125, 2);
  }
);
