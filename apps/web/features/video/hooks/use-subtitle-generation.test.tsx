// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { sessionEvents } from '@/features/auth/lib/session-events';
import { acceptedJobResponse } from '@/test/accepted-job-response';
import { bindWorkspaceSession, suspendWorkspace } from '@/lib/authenticated-fetch';
import { useSubtitleGeneration } from './use-subtitle-generation';

const { token } = vi.hoisted(() => ({ token: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ authClient: { token } }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const fixtureAsset = {
  success: true,
  data: {
    id: 'fixture-asset',
    name: 'fixture.mp4',
    ownerId: 'owner-a',
    hash: 'a'.repeat(64),
    mediaType: 'video/mp4',
    durationMs: 1000,
  },
};

function bind(owner: string, sid: string) {
  bindWorkspaceSession(owner, sid);
  token.mockResolvedValue({
    data: {
      token:
        'header.' +
        btoa(JSON.stringify({ sub: owner, sid, exp: Date.now() / 1000 + 900 })) +
        '.signature',
    },
  });
}

async function startAcceptedJob(isYouTube = false) {
  const ingestionPath = isYouTube ? '/api/studio/shorts' : '/api/studio/assets';
  bind('owner-a', 'initial');
  const onError = vi.fn();
  const onComplete = vi.fn();
  const calls: string[] = [];
  let reads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), location.href).pathname;
      calls.push((init?.method ?? 'GET') + ' ' + path);
      if (path === ingestionPath) {
        expect(new URL(String(input)).origin).toBe(location.origin);
        expect(new Headers(init?.headers).get('authorization')).toMatch(/^Bearer /);
        if (isYouTube)
          expect(JSON.parse(String(init?.body))).toEqual({
            action: 'download',
            url: 'https://youtu.be/jNQXAC9IVRw',
          });
        return Response.json(fixtureAsset);
      }
      if (path === '/api/generate-subtitles') {
        expect(JSON.parse(String(init?.body))).toEqual({
          sourceAssetId: 'fixture-asset',
          language: null,
        });
        return Response.json(
          { success: true, data: { jobId: 'transcription-id' } },
          { status: 202 }
        );
      }
      if (path === '/api/jobs/transcription-id') {
        if (++reads === 1) return Response.json({ success: false }, { status: 401 });
        return Response.json({
          success: true,
          data: {
            id: 'transcription-id',
            status: 'completed',
            resultData: {
              subtitles: [{ start: 0, end: 500, text: 'Subtítulo' }],
              sourceDurationMs: 1000,
            },
          },
        });
      }
      throw new Error('Solicitud inesperada');
    })
  );
  const view = renderHook(() => useSubtitleGeneration({ onComplete, onError }));
  if (isYouTube)
    act(() => {
      view.result.current.setInputMode('youtube');
      view.result.current.setYoutubeUrl('https://youtu.be/jNQXAC9IVRw');
    });
  else
    act(() =>
      view.result.current.setFile(new File(['fixture'], 'fixture.mp4', { type: 'video/mp4' }))
    );
  let work!: Promise<void>;
  await act(async () => {
    work = view.result.current.generateSubtitles();
  });
  expect(calls).toEqual([
    'POST ' + ingestionPath,
    'POST /api/generate-subtitles',
    'GET /api/jobs/transcription-id',
  ]);
  return { view, work, calls, onError, onComplete };
}

it('keeps an accepted job through a 401 and reads its result with the same owner without repeating the POST', async () => {
  const { view, work, calls, onError } = await startAcceptedJob();
  expect(view.result.current.currentStep).toBe('generating-subtitles');
  await act(async () => {
    bind('owner-a', 'renewed');
    window.dispatchEvent(new Event(sessionEvents.restored));
    await work;
  });
  expect(calls).toEqual([
    'POST /api/studio/assets',
    'POST /api/generate-subtitles',
    'GET /api/jobs/transcription-id',
    'GET /api/jobs/transcription-id',
  ]);
  expect(view.result.current.currentStep).toBe('editing');
  expect(view.result.current.subtitles[0]?.text).toBe('Subtítulo');
  expect(onError).not.toHaveBeenCalled();
});

it.each(['signout', 'different-owner'])('cancels a suspended job on %s', async (reason) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { view, work, calls, onError } = await startAcceptedJob();
  expect(onError).not.toHaveBeenCalled();
  await act(async () => {
    if (reason === 'signout') window.dispatchEvent(new Event(sessionEvents.ending));
    else {
      bind('owner-b', 'other-session');
      window.dispatchEvent(new Event(sessionEvents.restored));
    }
    await work;
  });
  expect(view.result.current.currentStep).toBe('error');
  expect(view.result.current.subtitles).toEqual([]);
  expect(calls.filter((call) => call.startsWith('GET'))).toEqual([
    'GET /api/jobs/transcription-id',
  ]);
});

it('finishes the original accepted render after same-owner sign-in', async () => {
  const { view, work, onComplete } = await startAcceptedJob();
  await act(async () => {
    bind('owner-a', 'transcription-session');
    window.dispatchEvent(new Event(sessionEvents.restored));
    await work;
  });
  const output = '/api/jobs/render-id/download';
  const fetcher = vi.mocked(fetch);
  fetcher
    .mockClear()
    .mockResolvedValueOnce(
      Response.json({ success: true, data: { jobId: 'render-id' } }, { status: 202 })
    )
    .mockResolvedValueOnce(Response.json({ success: false }, { status: 401 }))
    .mockResolvedValueOnce(
      Response.json({
        success: true,
        data: { id: 'render-id', status: 'completed', resultData: { videoUrl: output } },
      })
    );
  let rendering!: Promise<void>;
  await act(async () => {
    rendering = view.result.current.renderVideo();
  });
  expect(view.result.current.currentStep).toBe('rendering');
  await act(async () => {
    bind('owner-a', 'render-session');
    window.dispatchEvent(new Event(sessionEvents.restored));
    await rendering;
  });
  expect(
    fetcher.mock.calls.map(([url, init]) => [init?.method ?? 'GET', new URL(String(url)).pathname])
  ).toEqual([
    ['POST', '/api/render-video-subtitles'],
    ['GET', '/api/jobs/render-id'],
    ['GET', '/api/jobs/render-id'],
  ]);
  expect(view.result.current.renderedVideoUrl).toBe(output);
  expect(onComplete).toHaveBeenCalledExactlyOnceWith(output);
});

it.each(['transcription during retirement', 'render after leaving'])(
  'cancels %s between acceptance and the first status read',
  async (scenario) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { view, work, onComplete } = await startAcceptedJob();
    await act(async () => {
      bind('owner-a', 'renewed');
      window.dispatchEvent(new Event(sessionEvents.restored));
      await work;
    });
    const render = scenario.startsWith('render');
    const accepted = acceptedJobResponse('already-accepted');
    const fetcher = vi.mocked(fetch).mockClear();
    if (!render) fetcher.mockResolvedValueOnce(Response.json(fixtureAsset));
    fetcher.mockResolvedValueOnce(accepted.response).mockImplementation(async () =>
      Response.json({
        success: true,
        data: {
          id: 'already-accepted',
          status: 'completed',
          resultData: { subtitles: [], sourceDurationMs: 1000, videoUrl: '/late' },
        },
      })
    );
    let finished = false;
    await act(async () => {
      const action = render
        ? view.result.current.renderVideo()
        : view.result.current.generateSubtitles();
      void action.then(() => {
        finished = true;
      });
    });
    expect(accepted.response.bodyUsed).toBe(true);
    const count = fetcher.mock.calls.length;
    try {
      await act(async () => {
        window.dispatchEvent(new Event(sessionEvents.ending));
        if (render) {
          suspendWorkspace();
          window.dispatchEvent(new Event(sessionEvents.leaving));
        }
        accepted.deliver();
      });
      expect(finished).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(count);
      expect(view.result.current.currentStep).toBe('error');
      expect(onComplete).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        window.dispatchEvent(new Event(sessionEvents.leaving));
      });
    }
  }
);

it('subtitleGeneratorUsesOwnedIngestion for YouTube', async () => {
  const { view, work } = await startAcceptedJob(true);
  await act(async () => {
    bind('owner-a', 'renewed');
    window.dispatchEvent(new Event(sessionEvents.restored));
    await work;
  });
  expect(view.result.current.sourceAssetId).toBe('fixture-asset');
  expect(view.result.current.currentStep).toBe('editing');
});
