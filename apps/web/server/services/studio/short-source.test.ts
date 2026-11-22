import { describe, expect, it, vi, afterEach } from 'vitest';
import { ClipIntegrationService } from '../clip-integration-service';
import { ShortSourceService } from './short-source';
import { extractVideoId } from '@/features/video/lib/youtube';

describe('source registration and transcription', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('accepts exact supported video URLs and forwards only a canonical ID', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          filename: 'yt_jNQXAC9IVRw_abc12345.mp4',
          path: 'uploads/yt_jNQXAC9IVRw_abc12345.mp4',
        })
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([0, 1])));
    vi.stubGlobal('fetch', fetcher);
    const service = new ClipIntegrationService('http://internal.test');
    await service.downloadYouTube('https://youtu.be/jNQXAC9IVRw?t=4');
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).url).toBe(
      'https://www.youtube.com/watch?v=jNQXAC9IVRw'
    );
    expect(fetcher.mock.calls[1]![0]).toBe(
      'http://internal.test/uploads/yt_jNQXAC9IVRw_abc12345.mp4'
    );
    expect(extractVideoId('https://example.test/youtube.com/watch?v=jNQXAC9IVRw')).toBeNull();
  });
  it('rejects an unrelated response file before fetching bytes', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ filename: 'yt_jNQXAC9IVRw_abc12345.mp4', path: 'uploads/other.mp4' })
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      new ClipIntegrationService().downloadYouTube('https://youtu.be/jNQXAC9IVRw')
    ).rejects.toThrow(/descargar/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('permits a silent measured source without contacting Whisper', async () => {
    const assets = {
      get: vi
        .fn()
        .mockResolvedValue({ mediaType: 'video/mp4', durationMs: 24000, hasAudio: false }),
      resolveFile: vi.fn(),
      ingest: vi.fn(),
    };
    const python = {
      downloadYouTube: vi.fn(),
      transcribeSource: vi.fn(),
      cropSource: vi.fn(),
      openProcessedCrop: vi.fn(),
    };
    expect(await new ShortSourceService(assets, python).transcribe('owner', 'source')).toEqual({
      cues: [],
      language: null,
    });
    expect(assets.resolveFile).not.toHaveBeenCalled();
    expect(python.transcribeSource).not.toHaveBeenCalled();
  });
});
