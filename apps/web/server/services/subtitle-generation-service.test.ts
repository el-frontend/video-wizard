import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AssetRecord } from '@workspace/video-project';
import { AssetService } from './studio/asset-service';
import { shortSource } from './studio/shorts';
import { SubtitleGenerationService } from './subtitle-generation-service';
import { storedRenderInput } from './owned-media-service';

vi.mock('@/server/db', () => ({ db: {} }));

const owner = randomUUID(),
  sourceId = randomUUID(),
  outputId = randomUUID(),
  rendererId = randomUUID(),
  webJobId = randomUUID();
const record: AssetRecord = {
  id: sourceId,
  ownerId: owner,
  hash: 'a'.repeat(64),
  name: 'video.mp4',
  mediaType: 'video/mp4',
  locator: 'assets/private-file',
  durationMs: 8000,
  width: 1920,
  height: 1080,
  hasAudio: true,
};
const seconds = {
  start: 0.5,
  end: 2.3,
  text: 'Caption',
  words: [{ word: 'Caption', start: 0.6, end: 0.9 }],
};
const milliseconds = {
  start: 500,
  end: 2300,
  text: 'Caption',
  words: [{ word: 'Caption', start: 600, end: 900 }],
};
const renderOrigin = 'http://renderer.test';
const service = new SubtitleGenerationService(renderOrigin);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(AssetService.prototype, 'get').mockResolvedValue(record);
  vi.spyOn(AssetService.prototype, 'ingest').mockResolvedValue({ ...record, id: outputId });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('reports measured duration and preserves each timed word in milliseconds', async () => {
  const transcribe = vi.spyOn(shortSource, 'transcribe').mockResolvedValue({
    language: 'en',
    cues: [
      {
        id: 'cue',
        startMs: 500,
        endMs: 2300,
        text: 'Caption',
        words: [{ text: 'Caption', startMs: 100, endMs: 400 }],
      },
    ],
  });
  expect(
    await service.generateSubtitles(owner, { sourceAssetId: sourceId, language: 'es' })
  ).toMatchObject({
    subtitles: [milliseconds],
    sourceDurationMs: 8000,
    videoDuration: 8000,
  });
  expect(transcribe).toHaveBeenCalledWith(owner, sourceId, 'es');
});
it.each(['milliseconds', 'seconds'] as const)(
  'sends full measured duration and edited words to Remotion on the %s input clock',
  async (subtitleClock) => {
    const requests = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ jobId: rendererId }))
      .mockResolvedValueOnce(
        Response.json({ status: 'completed', videoUrl: 'https://untrusted.test/output.mp4' })
      )
      .mockResolvedValueOnce(new Response('fixture'));
    vi.stubGlobal('fetch', requests);
    const render = service.render(
      owner,
      webJobId,
      storedRenderInput.parse({
        sourceAssetId: sourceId,
        sourceDurationMs: 123,
        subtitleClock,
        subtitles: [subtitleClock === 'milliseconds' ? milliseconds : seconds],
        template: 'modern',
        language: 'en',
        brandKit: { textColor: '#ffffff' },
      })
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(await render).toEqual({
      jobId: webJobId,
      sourceAssetId: sourceId,
      outputAssetId: outputId,
      videoUrl: '/api/studio/assets/' + outputId,
    });
    const admission = JSON.parse(String(requests.mock.calls[0]![1]?.body));
    expect(admission.sourceAsset).toEqual({
      assetId: sourceId,
      hash: record.hash,
      mediaType: record.mediaType,
      durationMs: 8000,
      width: 1920,
      height: 1080,
      hasAudio: true,
    });
    expect(admission.inputProps).toMatchObject({
      durationInFrames: 240,
      subtitles: [{ id: 1, ...seconds }],
      brandKit: { textColor: '#ffffff' },
    });
    expect(admission.inputProps).not.toHaveProperty('videoUrl');
    expect(requests.mock.calls.map(([url]) => url)).toEqual([
      renderOrigin + '/renders',
      renderOrigin + '/renders/' + rendererId,
      renderOrigin + '/renders/' + rendererId + '.mp4',
    ]);
  }
);
it('requires a UUID receipt before requesting status or the artifact', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ jobId: 'invalid/path' }));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    service.render(
      owner,
      webJobId,
      storedRenderInput.parse({ sourceAssetId: sourceId, subtitleClock: 'seconds', subtitles: [] })
    )
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
