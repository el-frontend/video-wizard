import { z } from 'zod';
import { contrastRatio } from '@workspace/render-contract';
import {
  IdSchema,
  FontBindingSchema,
  LibraryEntrySchema,
  LibraryRefSchema,
  StudioBrandRoleSchema,
  StyleFamilySchema,
  type EntryOf,
} from '@workspace/video-project';
import { ValidationError } from '@/server/lib/utils';
import type { LibraryService } from './library-service';
import { builtinSource } from './catalog-source';
const color = z.string().regex(/^#[a-f0-9]{6}$/i);
const tokens = z.strictObject({
  colors: z.strictObject({ background: color, foreground: color, accent: color, surface: color }),
  typography: z.strictObject({
    display: z.strictObject({
      fontFamily: IdSchema,
      weight: z.int().min(1).max(1000),
      cqw: z.number().min(0.1).max(100),
      lineHeight: z.number().min(0.5).max(4),
    }),
  }),
});
const identity = { ...LibraryRefSchema.shape, name: IdSchema };
const styleInput = z.strictObject({
  ...identity,
  kind: z.literal('style'),
  family: StyleFamilySchema,
  tokens,
  exposedRoles: z.array(StudioBrandRoleSchema).optional(),
  fonts: z.array(FontBindingSchema),
  frameMarkdown: z.string().optional(),
});
const componentInput = z.strictObject({
  ...identity,
  kind: z.literal('component'),
  sourceRef: LibraryRefSchema,
});
export async function publishEdition(library: LibraryService, owner: string, data: unknown) {
  const component = componentInput.safeParse(data);
  if (component.success) {
    const { sourceRef, id, version, name } = component.data;
    const source = await library.get(owner, sourceRef);
    if (source.kind !== 'component' || !(await library.verifiedComponent(owner, source)))
      throw new ValidationError('Selecciona un preset de subtítulos verificado.');
    return library.publish(
      owner,
      { ...source, id, version, name },
      await builtinSource(source.manifest.builtin!)
    );
  }
  const parsed = styleInput.safeParse(data);
  if (!parsed.success)
    throw new ValidationError('La edición debe usar una familia y valores declarativos válidos.');
  const { tokens: appearance, ...rest } = parsed.data;
  const { foreground, background } = appearance.colors;
  if ((contrastRatio(foreground, background) ?? 0) < 3)
    throw new ValidationError('El texto y el fondo necesitan contraste de al menos 3:1.');
  const candidate = LibraryEntrySchema.safeParse({
    ...rest,
    tokens: appearance,
    assetIds: [...new Set(rest.fonts.map((f) => f.assetId))],
    engines: ['remotion', 'hyperframes'],
    exposedRoles: rest.exposedRoles ?? ['colors.accent', 'typography.display.fontFamily'],
  });
  if (!candidate.success || candidate.data.kind !== 'style')
    throw new ValidationError('La vinculación de fuentes no es válida.');
  const entry: EntryOf<'style'> = candidate.data;
  const display = appearance.typography.display;
  if (
    display.fontFamily !== 'sans-serif' &&
    !entry.fonts?.some(
      (f) =>
        f.family === display.fontFamily &&
        f.weight.min <= display.weight &&
        f.weight.max >= display.weight
    )
  )
    throw new ValidationError('Vincula una fuente que cubra el peso de texto indicado.');
  await library.verifyEditionFonts(owner, entry);
  return library.publish(owner, entry);
}
