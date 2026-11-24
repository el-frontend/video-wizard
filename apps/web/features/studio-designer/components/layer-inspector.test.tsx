// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { componentExample } from '@workspace/video-project';
import { exampleProject } from '@workspace/video-project/fixtures';
import type { AssetDescriptor, Layer } from '@workspace/video-project';
import { LayerInspector } from './layer-inspector';
import { MediaInspector } from './media-inspector';

afterEach(cleanup);
const project = exampleProject();
const video: Extract<Layer, { type: 'video' }> = {
  id: 'clip',
  type: 'video',
  box: { x: 0, y: 0, width: 300, height: 200 },
  fit: 'cover',
  focalPoint: { x: 0.5, y: 0.5 },
  volume: 0.6,
  assetId: 'asset',
  visible: true,
  zIndex: 1,
  sourceInMs: 5000,
  startMs: 1000,
  endMs: 8000,
  endAnchor: 'fixed',
};
const asset: AssetDescriptor = {
  id: 'asset',
  ownerId: 'owner',
  hash: '0'.repeat(64),
  name: 'Clip.mp4',
  mediaType: 'video/mp4',
  durationMs: 12000,
};
function edit(label: string, value: string) {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

it('commits box, stacking, visibility and timing by layer ID; a negative interval preserves the draft', () => {
  const onCommand = vi.fn();
  const layer = project.scenes[1]!.layers[0]!;
  if (layer.type !== 'text') throw Error('fixture');
  render(
    <LayerInspector
      sceneId="outro"
      layer={layer}
      canvas={project.canvas}
      manifest={undefined}
      onCommand={onCommand}
    />
  );
  edit('X (px)', '140');
  edit('Y (px)', '250');
  edit('Ancho (px)', '160');
  edit('Alto (px)', '80');
  edit('Orden Z', '4');
  fireEvent.click(screen.getByLabelText('Visible'));
  edit('Inicio (ms)', '150');
  edit('Fin (ms)', '3000');
  expect(onCommand.mock.calls.map(([c]) => c.patch)).toStrictEqual([
    { box: { ...layer.box, x: 140 } },
    { box: { ...layer.box, y: 250 } },
    { box: { ...layer.box, width: 160 } },
    { box: { ...layer.box, height: 80 } },
    { zIndex: 4 },
    { visible: false },
    { startMs: 150 },
    { endMs: 3000 },
  ]);
  expect(
    onCommand.mock.calls.every(
      ([cmd]) => cmd.type === 'update-layer' && cmd.layerId === layer.id && cmd.sceneId === 'outro'
    )
  ).toBe(true);
  edit('Fin (ms)', '50');
  expect(onCommand).toHaveBeenCalledTimes(8);
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(layer.endMs).toBe(2900);
});

it('restricts component fields to the pinned manifest and preserves unrecognized saved values', () => {
  const layer = project.scenes[0]!.layers[2]!;
  if (layer.type !== 'component') throw Error('fixture');
  const onCommand = vi.fn();
  render(
    <LayerInspector
      sceneId="intro"
      layer={{ ...layer, props: { headline: 'Hola', legacy: 1 } }}
      canvas={project.canvas}
      manifest={{ version: 1, props: { headline: { type: 'string', required: true } } }}
      onCommand={onCommand}
    />
  );
  expect(screen.queryByLabelText('legacy')).toBeNull();
  fireEvent.change(screen.getByLabelText('headline'), { target: { value: 'Nuevo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar propiedades' }));
  expect(onCommand).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeTruthy();
});

it('changing focal point and fit only patches framing; source trim enforces measured duration', () => {
  const onCommand = vi.fn();
  render(<MediaInspector sceneId="intro" layer={video} asset={asset} onCommand={onCommand} />);
  edit('Foco horizontal (%)', '80');
  fireEvent.change(screen.getByLabelText('Encuadre'), { target: { value: 'contain' } });
  expect(onCommand.mock.calls.map(([c]) => c.patch)).toEqual([
    { focalPoint: { x: 0.8, y: 0.5 } },
    { fit: 'contain' },
  ]);
  edit('Entrada de fuente (ms)', '5001');
  expect(onCommand).toHaveBeenCalledTimes(2);
  edit('Entrada de fuente (ms)', '4999');
  expect(onCommand.mock.lastCall?.[0].patch).toEqual({ sourceInMs: 4999 });
});

it('validates all declared property types together before emitting one reversible command', () => {
  const layer = project.scenes[0]!.layers[2]!;
  if (layer.type !== 'component') throw Error('fixture');
  const onCommand = vi.fn();
  render(
    <LayerInspector
      sceneId="intro"
      layer={{ ...layer, props: { headline: 'Hola', count: 1 } }}
      canvas={project.canvas}
      manifest={{
        version: 1,
        props: {
          headline: { type: 'string', required: true },
          count: { type: 'number', required: true },
          tags: { type: 'array' },
        },
      }}
      onCommand={onCommand}
    />
  );
  fireEvent.change(screen.getByLabelText('headline'), { target: { value: 'Próximo' } });
  fireEvent.change(screen.getByLabelText('count'), { target: { value: 'false' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar propiedades' }));
  expect(onCommand).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('count'), { target: { value: '1e999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar propiedades' }));
  expect(onCommand).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('count'), { target: { value: '2' } });
  fireEvent.click(screen.getByLabelText('Incluir tags'));
  fireEvent.change(screen.getByLabelText('tags', { exact: true }), {
    target: { value: '["uno"]' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar propiedades' }));
  expect(onCommand).toHaveBeenCalledExactlyOnceWith({
    type: 'update-layer',
    sceneId: 'intro',
    layerId: layer.id,
    patch: { props: { headline: 'Próximo', count: 2, tags: ['uno'] } },
  });
});

it('trims the source out point and explicitly repairs an older interval that cannot fit', () => {
  const onCommand = vi.fn();
  const { rerender } = render(
    <MediaInspector sceneId="intro" layer={video} asset={asset} onCommand={onCommand} />
  );
  edit('Salida de fuente (ms)', '10000');
  expect(onCommand.mock.lastCall?.[0].patch).toEqual({ endMs: 6000, endAnchor: 'fixed' });
  rerender(
    <MediaInspector
      sceneId="intro"
      layer={{ ...video, sourceInMs: 13000, endMs: 15000 }}
      asset={asset}
      onCommand={onCommand}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Encajar tramo en la fuente' }));
  expect(onCommand.mock.lastCall?.[0].patch).toEqual({
    sourceInMs: 0,
    endMs: 13000,
    endAnchor: 'fixed',
  });
});

it.each(['remotion', 'hyperframes'] as const)(
  'edits a generated %s title without recompiling it',
  (engine) => {
    const source = componentExample(engine),
      onCommand = vi.fn(),
      layer = project.scenes[0]!.layers[2]!;
    if (layer.type !== 'component') throw Error('fixture');
    render(
      <LayerInspector
        sceneId="intro"
        layer={{ ...layer, props: source.manifest.initialProps }}
        canvas={project.canvas}
        manifest={source.manifest}
        onCommand={onCommand}
      />
    );
    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Título editado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar propiedades' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'update-layer',
      sceneId: 'intro',
      layerId: layer.id,
      patch: { props: { title: 'Título editado' } },
    });
  }
);
