import { changedReviewLayers } from './component-validation';
import { visualContext, libraryKey } from '@workspace/render-contract';
import { exampleProject } from '@workspace/video-project/fixtures';
import { describe, expect, it } from 'vitest';
import {
  ComponentManifestSchema,
  componentExample,
  validComponentProps,
  JsonObjectSchema,
} from '@workspace/video-project';
import { compileComponent } from '../../../../remotion-server/server/component-compiler';

describe('versioned visual components', () => {
  it.each(['remotion', 'hyperframes'] as const)('seals the %s browser module', async (engine) => {
    const input = componentExample(engine);
    const a = await compileComponent(input);
    const b = await compileComponent(input);
    expect(a).toEqual(b);
    expect(a.moduleHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.module).not.toContain('node_modules');
  });
  it.each([
    'fetch("https://example.test")',
    'Date.now()',
    'Math.random()',
    'requestAnimationFrame(run)',
    'setTimeout(run, 1)',
    'import("fs")',
    'document.createElement("audio")',
    'new Audio()',
    'not valid (',
  ])('reports forbidden source in the graph: %s', async (source) => {
    const input = componentExample('remotion');
    await expect(
      compileComponent({ ...input, files: { ...input.files, 'other.ts': source } })
    ).rejects.toThrow(/other.ts/);
  });
  it.each([
    'export default function Title() {}',
    'export default function Title(input) { return 42; }',
  ])('rejects a malformed native factory contract: %s', async (source) => {
    const input = componentExample('hyperframes');
    await expect(
      compileComponent({ ...input, files: { [input.manifest.entry]: source } })
    ).rejects.toThrow(/title.ts/);
  });
  it.each(['../outside', 'gsap', 'node:path'])('rejects imports from %s', async (specifier) => {
    const input = componentExample('remotion');
    await expect(
      compileComponent({
        ...input,
        files: { ...input.files, 'helper.ts': `export { x } from "${specifier}";` },
      })
    ).rejects.toThrow(/helper.ts/);
  });
  it('validates closed nested schemas, required fields and typed enums', () => {
    const base = componentExample('remotion').manifest;
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['items'],
      properties: { items: { type: 'array', items: { type: 'string', enum: ['uno', 'dos'] } } },
    };
    const manifest = ComponentManifestSchema.parse({
      ...base,
      propsSchema: schema,
      initialProps: { items: ['uno'] },
    });
    expect(validComponentProps({ items: ['dos'] }, manifest)).toBe(true);
    for (const props of [{ items: ['tres'] }, { items: [1] }, {}, { items: [], extra: true }])
      expect(validComponentProps(JsonObjectSchema.parse(props), manifest)).toBe(false);
    expect(
      ComponentManifestSchema.safeParse({ ...manifest, propsSchema: { ...schema, $ref: 'remote' } })
        .success
    ).toBe(false);
    expect(
      ComponentManifestSchema.safeParse({
        ...manifest,
        propsSchema: { ...schema, properties: { constructor: { type: 'number' } } },
      }).success
    ).toBe(false);
  });
});

it.each(['style', 'brand'] as const)(
  'includes an existing visible window when %s changes its resolved appearance and another layer is added',
  (kind) => {
    const base = exampleProject();
    base.styleRef = null;
    base.brandSnapshot = null;
    const first = base.scenes[0]!.layers.find((l) => l.type === 'component')!;
    if (first.type !== 'component') throw Error('fixture');
    const second = { ...first, id: 'B' },
      pin = { id: 'paleta', version: 1 },
      tokens = { colors: { accent: '#FF2200' } };
    const next = structuredClone(base);
    next.scenes[0]!.layers.push(second);
    const manifest = componentExample('remotion').manifest;
    manifest.exposedRoles = ['colors.accent'];
    const component = {
      ...first.componentRef,
      kind: 'component' as const,
      name: 'Título',
      engine: 'remotion' as const,
      assetIds: [],
      manifest,
    };
    const style = { ...pin, kind: 'style' as const, name: 'Paleta', assetIds: [], tokens };
    if (kind === 'style') next.styleRef = pin;
    else next.brandSnapshot = { ref: pin, values: tokens };
    const deps = {
      assets: {},
      libraries: { [libraryKey(component)]: component, [libraryKey(style)]: style },
    };
    const before = visualContext(base, deps, first, manifest, 0),
      after = visualContext(next, deps, first, manifest, 0);
    expect(before.appearance.accent).not.toBe(after.appearance.accent);
    expect(after.appearance.accent).toBe('#FF2200');
    expect(changedReviewLayers(base, next)).toContain(
      JSON.stringify([next.scenes[0]!.id, first.id])
    );
  }
);
