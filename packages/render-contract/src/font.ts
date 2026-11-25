import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

type Weight = { min: number; max: number };
interface Font {
  variationAxes: { wght?: Weight };
  'OS/2': { usWeightClass: number };
  numGlyphs: number;
  unitsPerEm: number;
  glyphForCodePoint(code: number): { path: { commands: unknown[] } };
}
const fontkit: { create(bytes: Buffer): Font } = createRequire(import.meta.url)('fontkit');

export async function fontWeightRange(file: string, hash: string): Promise<Weight> {
  const bytes = await readFile(file).catch(() => {
    throw new Error('No se pudo leer la fuente. Vuelve a vincular el archivo.');
  });
  if (createHash('sha256').update(bytes).digest('hex') !== hash)
    throw new Error('El contenido de la fuente ha cambiado.');
  try {
    const font = fontkit.create(bytes);
    // Fontkit parses lazily. Force outline and required header decoding as well as metadata.
    if (!(font.unitsPerEm > 0 && font.numGlyphs > 0 && font.glyphForCodePoint(65).path.commands))
      throw new Error();
    const weight = font['OS/2'].usWeightClass;
    const range = font.variationAxes.wght ?? { min: weight, max: weight };
    if (!(range.min >= 1 && range.max <= 1000 && range.min <= range.max)) throw new Error();
    return { min: range.min, max: range.max };
  } catch {
    throw new Error('No se puede decodificar la fuente. Vincula un archivo de fuente válido.');
  }
}
export function checkFontWeight(actual: Weight, declared: Weight) {
  if (actual.min > declared.min || actual.max < declared.max)
    throw new Error(
      'El archivo de fuente admite pesos ' +
        actual.min +
        '–' +
        actual.max +
        '. Ajusta el intervalo declarado o vincula otra fuente.'
    );
}
