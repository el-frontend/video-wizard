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
