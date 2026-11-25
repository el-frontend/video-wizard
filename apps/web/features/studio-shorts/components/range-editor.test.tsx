// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LibraryEntrySchema } from '@workspace/video-project';
import { RangeEditor } from './range-editor';
import { useLibrary } from '@/features/studio-libraries/hooks/use-library';
vi.mock('@/features/studio-libraries/hooks/use-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/studio-libraries/hooks/use-library')>()),
  useLibrary: vi.fn(),
}));
afterEach(cleanup);
it('offers an eligible structural template in Shorts and submits its exact pin', () => {
  const template = LibraryEntrySchema.parse({
    kind: 'template',
    id: 'vertical',
    name: 'Cápsula',
    version: 2,
    engine: 'remotion',
    assetIds: [],
    manifest: { version: 1, props: {} },
    structure: {
      version: 1,
      canvas: { width: 1080, height: 1920, fps: 30 },
      scenes: [{ id: 'intro', durationMs: 800, layers: [] }],
      globalAudio: [],
      styleRef: null,
      slots: {},
    },
  });
  vi.mocked(useLibrary).mockReturnValue({ entries: [template], loading: false, error: undefined });
  const create = vi.fn();
  render(<RangeEditor duration={800} position={() => 0} create={create} busy={false} />);
  const option = screen.getByRole('option', { name: 'Cápsula · v2' }) as HTMLOptionElement;
  fireEvent.change(option.parentElement!, { target: { value: option.value } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));
  expect(create.mock.calls[0]?.[3]).toEqual({ id: 'vertical', version: 2 });
});
