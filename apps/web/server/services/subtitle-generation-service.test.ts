import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SubtitleGenerationService } from '@/server/services/subtitle-generation-service';

const engineUrl = 'http://engine.test';
const remotionUrl = 'http://renderer.test';
const videoPath = 'uploads/fixture #1.mp4';
const brandKit = { textColor: '#ffffff' };
const words = [{ word: 'Caption', start: 600, end: 900 }];
const subtitle = { start: 500, end: 2300, text: 'Caption', words };
const secondsSubtitle = {
  start: 0.5,
  end: 2.3,
  text: 'Caption',
  words: [{ word: 'Caption', start: 0.6, end: 0.9 }],
};
const renderInput = { videoPath, template: 'modern', language: 'en', brandKit } as const;

describe('subtitle generation service timing', () => {
  let service: SubtitleGenerationService;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    vi.stubEnv('PYTHON_ENGINE_INTERNAL_URL', engineUrl);
    vi.stubEnv('REMOTION_SERVER_URL', remotionUrl);
    vi.useFakeTimers();

    fetchMock = vi.fn<typeof fetch>(async (url) => {
      switch (url) {
        case `${engineUrl}/transcribe`:
          return Response.json({
            video_path: videoPath,
            audio_path: 'temp/fixture.wav',
            segments: [{ id: 0, ...secondsSubtitle }],
            full_text: 'Caption',
            language: 'en',
            segment_count: 1,
          });
        case `${engineUrl}/video-metadata`:
          return Response.json({ sourceDurationMs: 8000 });
        case `${remotionUrl}/renders`:
          return Response.json({ jobId: 'render-job' }, { status: 202 });
        case `${remotionUrl}/renders/render-job`:
          return Response.json({
            status: 'completed',
            videoUrl: `${remotionUrl}/renders/movie.mp4`,
          });
        default:
          throw new Error(`Unexpected fetch: ${url}`);
      }
    });
    vi.stubGlobal('fetch', fetchMock);
    service = new SubtitleGenerationService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function getRenderProps() {
    const body = fetchMock.mock.calls.find(([url]) => url === `${remotionUrl}/renders`)?.[1]?.body;
    expect(typeof body).toBe('string');
    return JSON.parse(body as string).inputProps;
  }

  it('reports the measured duration and keeps the transcript in milliseconds', async () => {
    await expect(service.generateSubtitles({ videoPath })).resolves.toMatchObject({
      subtitles: [subtitle],
      sourceDurationMs: 8000,
      videoDuration: 8000,
    });
  });

  it('sends the full duration, seconds, timed words and brand to Remotion', async () => {
    const rendering = service.renderWithSubtitles({
      ...renderInput,
      subtitles: [subtitle],
      sourceDurationMs: 8000,
    });

    await vi.advanceTimersByTimeAsync(2000);
    await rendering;

    expect(getRenderProps()).toMatchObject({
      videoUrl: `${engineUrl}/uploads/fixture%20%231.mp4`,
      durationInFrames: 240,
      subtitles: [{ id: 1, ...secondsSubtitle }],
      brandKit,
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(`${engineUrl}/video-metadata`);
  });

  it('probes the source for a legacy render request even without captions', async () => {
    const rendering = service.renderWithSubtitles({ ...renderInput, subtitles: [] });

    await vi.advanceTimersByTimeAsync(2000);
    await rendering;

    expect(getRenderProps()).toMatchObject({ durationInFrames: 240, subtitles: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      `${engineUrl}/video-metadata`,
      expect.objectContaining({ body: JSON.stringify({ video_path: videoPath }) })
    );
  });

  it('uses the host engine for probing and the container engine for Remotion', async () => {
    vi.stubEnv('PYTHON_ENGINE_INTERNAL_URL', undefined);
    vi.stubEnv('NEXT_PUBLIC_PYTHON_ENGINE_URL', engineUrl);
    const hostService = new SubtitleGenerationService();
    const rendering = hostService.renderWithSubtitles({ ...renderInput, subtitles: [] });

    await vi.advanceTimersByTimeAsync(2000);
    await rendering;

    expect(fetchMock).toHaveBeenCalledWith(`${engineUrl}/video-metadata`, expect.any(Object));
    expect(getRenderProps()).toMatchObject({
      videoUrl: 'http://processing-engine:8000/uploads/fixture%20%231.mp4',
      durationInFrames: 240,
    });
  });

  it('preserves timestamps in seconds for existing clip render requests', async () => {
    const rendering = service.renderClipWithSubtitles({
      ...renderInput,
      subtitles: [secondsSubtitle],
    });

    await vi.advanceTimersByTimeAsync(2000);
    await rendering;

    expect(getRenderProps()).toMatchObject({
      durationInFrames: 240,
      subtitles: [{ id: 1, ...secondsSubtitle }],
    });
  });

  it('rejects a non-media path before probing or rendering it', async () => {
    const invalid = expect(
      service.renderWithSubtitles({
        ...renderInput,
        videoPath: 'uploads/../fixture.mp4',
        subtitles: [],
        sourceDurationMs: 8000,
      })
    ).rejects.toThrow(/video path/i);

    await Promise.all([invalid, vi.advanceTimersByTimeAsync(2000)]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
