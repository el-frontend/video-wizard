import { describe, expect, it } from 'vitest';
import { applyCommand, type LibraryEntry } from '@workspace/video-project';
import {
  appearanceCommand,
  compatibleEntries,
} from '../../studio-designer/components/appearance-picker';
import { projectAppearance, libraryKey } from '@workspace/render-contract';
describe('independent appearance selection', () => {
  it('pins the brand, preserves narration and lets a layer override the accent', () => {
    const style: LibraryEntry = {
      kind: 'style',
      id: 'noticias-elfrontend-web',
      version: 2,
      name: 'Estilo B',
      assetIds: [],
      engines: ['remotion'],
      tokens: { colors: { accent: '#556677' } },
      exposedRoles: ['colors.accent'],
    };
    const brand: LibraryEntry = {
      kind: 'brand',
      id: 'a',
      version: 1,
      name: 'Marca A',
      assetIds: [],
      values: { colors: { accent: '#aa2233' } },
    };
    const scene = {
      id: 's',
      durationMs: 1000,
      layers: [],
      editorial: { narration: 'Conservar mi voz' },
    };
    const initial = {
      schemaVersion: 1 as const,
      id: 'p',
      title: 'Prueba',
      canvas: { width: 1080, height: 1920, fps: 30 },
      engine: 'remotion' as const,
      scenes: [scene],
      durationMs: 1000,
      globalAudio: [],
      assetIds: [],
      styleRef: null,
      brandSnapshot: null,
    };
    const draft = applyCommand(
      applyCommand(initial, appearanceCommand(style)),
      appearanceCommand(brand)
    );
    expect(draft.scenes).toEqual([scene]);
    expect(draft.styleRef).toEqual({ id: style.id, version: 2 });
    const deps = {
      assets: {},
      libraries: { [libraryKey(style)]: style, [libraryKey(brand)]: brand },
    };
    expect(projectAppearance(draft, deps).accent).toBe('#aa2233');
    const newStyle = {
      ...style,
      id: 'propio',
      version: 1,
      family: { id: 'noticias-liquid-glass', version: 1 } as const,
      exposedRoles: ['colors.foreground'],
    };
    const paletteBrand = {
      ...brand,
      values: { colors: { foreground: '#eeeeee', accent: '#badbad' } },
    };
    const configured = applyCommand(
      applyCommand(initial, appearanceCommand(newStyle)),
      appearanceCommand(paletteBrand)
    );
    const merged = projectAppearance(configured, {
      assets: {},
      libraries: { [libraryKey(newStyle)]: newStyle, [libraryKey(paletteBrand)]: paletteBrand },
    });
    expect(merged.foreground).toBe('#eeeeee');
    expect(merged.accent).toBe('#556677');
    expect(
      projectAppearance(draft, deps, {
        type: 'text',
        id: 'l',
        startMs: 0,
        endMs: 1000,
        endAnchor: 'scene-end',
        visible: true,
        zIndex: 1,
        text: 'x',
        box: { x: 0, y: 0, width: 200, height: 40 },
        overrides: { colors: { accent: '#003366' } },
      }).accent
    ).toBe('#003366');
    expect(compatibleEntries([style, brand], 'hyperframes')).toEqual([brand]);
  });
});
