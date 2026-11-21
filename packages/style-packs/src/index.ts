import { readFile } from 'node:fs/promises';
import { IdSchema, JsonObjectSchema, LibraryRefSchema } from '@workspace/video-project';
import { parse } from 'yaml';
import { z } from 'zod';

const frameSpec = z.object({
  version: LibraryRefSchema.shape.version,
  name: IdSchema,
  colors: JsonObjectSchema,
  typography: JsonObjectSchema,
  spacing: JsonObjectSchema,
  motion: JsonObjectSchema,
});

export const stylePackIds = [
  'noticias-liquid-glass',
  'noticias-elfrontend-web',
  'noticias-modern-editorial',
] as const;

export const stylePackFonts = [
  { family: 'Archivo Black', filename: 'ArchivoBlack-400.woff2', weight: { min: 400, max: 400 } },
  {
    family: 'Bricolage Grotesque',
    filename: 'Bricolage-800.woff2',
    weight: { min: 200, max: 800 },
  },
  { family: 'Geist', filename: 'Geist-variable.woff2', weight: { min: 100, max: 900 } },
  { family: 'Geist Mono', filename: 'GeistMono-variable.woff2', weight: { min: 100, max: 900 } },
].map((font) => ({
  ...font,
  source: new URL('../packs/fonts/' + font.filename, import.meta.url),
}));

export async function loadStylePack(id: (typeof stylePackIds)[number], file?: string) {
  const frameMarkdown = await readFile(
    file ?? new URL(`../packs/${id}/frame.md`, import.meta.url),
    'utf8'
  );
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(frameMarkdown)?.[1];
  if (!header) throw new Error(`Falta la cabecera del estilo ${id}.`);
  // Archived single-line descriptions are prose and may contain an unquoted colon.
  const tokenHeader = header.replace(/^description:[^\r\n]*(?:\r?\n|$)/m, '');
  const { version, name, ...tokens } = frameSpec.parse(parse(tokenHeader, { maxAliasCount: 0 }));
  return {
    kind: 'style' as const,
    id,
    version,
    name,
    frameMarkdown,
    tokens,
    engines: [],
    exposedRoles: ['colors.accent', 'typography.display.fontFamily'],
  };
}
