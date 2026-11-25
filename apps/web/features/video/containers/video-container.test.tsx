// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { acceptedJobResponse } from '@/test/accepted-job-response';
import { bindWorkspaceSession } from '@/lib/authenticated-fetch';
import { sessionEvents } from '@/features/auth/lib/session-events';
import { VideoContainer } from './video-container';
const { processing, token } = vi.hoisted(() => ({ processing: vi.fn(), token: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));
vi.mock('@/lib/auth-client', () => ({ authClient: { token } }));
vi.mock('@/features/video', () => ({
  useVideoProcessing: processing,
  VideoHeader: () => null,
  VideoUploader: () => null,
  ProcessingProgress: () => null,
  ClipCard: ({ isLoading }: { isLoading: boolean }) => (
    <span>{isLoading ? 'pendiente' : 'resuelto'}</span>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('cancels both cards without reading the first accepted clip or submitting the next clip', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const accepted = acceptedJobResponse('clip-one');
  bindWorkspaceSession('owner', 'sid');
  token.mockResolvedValue({
    data: {
      token:
        'h.' +
        btoa(JSON.stringify({ sub: 'owner', sid: 'sid', exp: Date.now() / 1000 + 900 })) +
        '.s',
    },
  });
  processing.mockReturnValue({ aspectRatio: '9:16', currentStep: 'complete' });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(accepted.response)
    .mockImplementation(async () =>
      Response.json({
        success: true,
        data: { id: 'clip-one', status: 'completed', resultData: { output_url: '/late' } },
      })
    );
  vi.stubGlobal('fetch', fetcher);
  render(<VideoContainer ownerId="owner" />);
  const clip = { viral_score: 10, summary: 'Clip', start_time: 0, end_time: 1 };
  await act(async () => {
    processing.mock.calls[0]![0].onComplete({ clips: [clip, clip] }, 'asset', {
      cues: [],
      language: 'es',
    });
  });
  expect(accepted.response.bodyUsed).toBe(true);
  expect(screen.getAllByText('pendiente')).toHaveLength(2);
  await act(async () => {
    window.dispatchEvent(new Event(sessionEvents.ending));
    accepted.deliver();
  });
  expect(
    fetcher.mock.calls.map(([url, init]) => [new URL(String(url)).pathname, init?.method])
  ).toEqual([['/api/create-clip', 'POST']]);
  expect(screen.getAllByText('resuelto')).toHaveLength(2);
});
