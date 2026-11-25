// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VideoEditorContainer } from './editor-container';
const { player } = vi.hoisted(() => ({ player: vi.fn(() => null) }));
vi.mock('@remotion/player', () => ({ Player: player }));
vi.mock('@/components/video-editor/ExportControls', () => ({ ExportControls: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it.each([{ subtitles: [] }, { subtitles: [{ id: 1, start: 0.2, end: 1, text: 'Palabra' }] }])(
  'previews every measured frame with captions $subtitles',
  ({ subtitles }) => {
    render(
      <VideoEditorContainer sourceAssetId="owned" sourceDurationMs={25040} subtitles={subtitles} />
    );
    expect(player).toHaveBeenCalledWith(
      expect.objectContaining({
        durationInFrames: 752,
        inputProps: expect.objectContaining({ subtitles }),
      }),
      undefined
    );
  }
);
